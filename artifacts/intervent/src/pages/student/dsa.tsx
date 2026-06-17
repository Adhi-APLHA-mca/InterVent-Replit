import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { onAuthStateChanged } from "firebase/auth";
import { motion, AnimatePresence } from "framer-motion";
import Editor from "@monaco-editor/react";
import {
  AlertTriangle, Clock, Shield, Send, Loader2, Eye,
  ChevronRight, Lock, Play, CheckCircle2, XCircle,
  Terminal, BarChart3, Code2
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const FASTAPI_URL = import.meta.env.VITE_FASTAPI_URL || "";
const PISTON_URL = "https://emkc.org/api/v2/piston/execute";
const EXAM_MINUTES = 90;
const MAX_VIOLATIONS = 3;

const LANGUAGES = [
  { id: "python",     label: "Python 3",    monaco: "python",     piston: { language: "python", version: "3.10.0" } },
  { id: "javascript", label: "JavaScript",  monaco: "javascript", piston: { language: "javascript", version: "18.15.0" } },
  { id: "java",       label: "Java",        monaco: "java",       piston: { language: "java", version: "15.0.2" } },
  { id: "cpp",        label: "C++",         monaco: "cpp",        piston: { language: "c++", version: "10.2.0" } },
];

const DIFF_STYLES = {
  Easy:   { bg: "bg-green-500/15",  text: "text-green-600 dark:text-green-400",  bar: "bg-green-500",  border: "border-green-500/30" },
  Medium: { bg: "bg-yellow-500/15", text: "text-yellow-600 dark:text-yellow-400", bar: "bg-yellow-500", border: "border-yellow-500/30" },
  Hard:   { bg: "bg-red-500/15",    text: "text-red-600 dark:text-red-400",    bar: "bg-red-500",    border: "border-red-500/30" },
};

interface TestCase { input: string; expected_output: string; description: string; }
interface DSAProblem {
  problem_index: number;
  title: string;
  difficulty: string;
  category: string;
  description: string;
  input_format: string;
  output_format: string;
  constraints: string[];
  sample_test_cases: TestCase[];
  starter_code_python: string;
  starter_code_javascript: string;
}
interface RunResult { passed: boolean; actual: string; stderr: string; description: string; }

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function DSAPage() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const jobId = params.get("job_id") || "";
  const candidateId = params.get("candidate_id") || "";
  const { toast } = useToast();

  type Phase = "loading" | "instructions" | "exam" | "submitting";
  const [phase, setPhase] = useState<Phase>("loading");
  const [problems, setProblems] = useState<DSAProblem[]>([]);
  const [activeProblem, setActiveProblem] = useState(0);
  const [codes, setCodes] = useState<string[]>(["", "", ""]);
  const [languages, setLanguages] = useState<string[]>(["python", "python", "python"]);
  const [runResults, setRunResults] = useState<(RunResult[] | null)[]>([null, null, null]);
  const [running, setRunning] = useState(false);
  const [submittedProblems, setSubmittedProblems] = useState<boolean[]>([false, false, false]);
  const [timeLeft, setTimeLeft] = useState(EXAM_MINUTES * 60);
  const [violations, setViolations] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [warningMsg, setWarningMsg] = useState("");
  const [timeCritical, setTimeCritical] = useState(false);

  const codesRef = useRef<string[]>(["", "", ""]);
  const langsRef = useRef<string[]>(["python", "python", "python"]);
  const violationsRef = useRef(0);
  const phaseRef = useRef<Phase>("loading");
  const authUserRef = useRef<ReturnType<typeof auth.currentUser>>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const startTimeRef = useRef<number>(Date.now());

  phaseRef.current = phase;

  const updateCode = (idx: number, val: string) => {
    const next = [...codesRef.current]; next[idx] = val; codesRef.current = next;
    setCodes([...next]);
  };
  const updateLang = (idx: number, lang: string) => {
    const next = [...langsRef.current]; next[idx] = lang; langsRef.current = next;
    setLanguages([...next]);
    const problem = problems[idx];
    if (!codesRef.current[idx]?.trim() || codesRef.current[idx] === getStarterCode(problem, langsRef.current[idx])) {
      updateCode(idx, getStarterCode(problem, lang));
    }
  };

  const getStarterCode = (problem: DSAProblem | undefined, lang: string) => {
    if (!problem) return "";
    if (lang === "javascript") return problem.starter_code_javascript || "";
    return problem.starter_code_python || "";
  };

  const doSubmit = async (_forced = false) => {
    if (phaseRef.current === "submitting") return;
    clearInterval(timerRef.current);
    setPhase("submitting");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    try {
      const user = authUserRef.current;
      if (!user) { setLocation("/"); return; }
      const idToken = await user.getIdToken();
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const submissions = codesRef.current.map((code, i) => ({
        problem_index: i, code, language: langsRef.current[i],
      }));
      const res = await fetch(`${FASTAPI_URL}/api/dsa/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId, candidate_id: candidateId, student_token: idToken,
          submissions, time_taken_seconds: elapsed, violations: violationsRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Submission failed");
      setLocation(`/student/dsa/results?job_id=${jobId}&candidate_id=${candidateId}`);
    } catch {
      toast({ title: "Submission failed", description: "Please try again.", variant: "destructive" });
      setPhase("exam");
    }
  };

  const runCode = async () => {
    const i = activeProblem;
    const problem = problems[i];
    if (!problem || !codesRef.current[i]?.trim()) {
      toast({ title: "Nothing to run", description: "Write some code first.", variant: "destructive" }); return;
    }
    setRunning(true);
    const lang = LANGUAGES.find(l => l.id === langsRef.current[i]) ?? LANGUAGES[0];
    const results: RunResult[] = [];
    for (const tc of problem.sample_test_cases) {
      try {
        const resp = await fetch(PISTON_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            language: lang.piston.language, version: lang.piston.version,
            files: [{ content: codesRef.current[i] }],
            stdin: tc.input, run_timeout: 5000,
          }),
        });
        const data = await resp.json();
        const run = data.run ?? {};
        const actual = (run.stdout ?? "").trim();
        const expected = tc.expected_output.trim();
        results.push({ passed: actual === expected && (run.code ?? 0) === 0, actual, stderr: (run.stderr ?? "").slice(0, 300), description: tc.description });
      } catch {
        results.push({ passed: false, actual: "", stderr: "Network error calling code runner", description: tc.description });
      }
    }
    const next = [...runResults]; next[i] = results; setRunResults(next);
    setRunning(false);
    const allPassed = results.every(r => r.passed);
    if (allPassed) {
      const s = [...submittedProblems]; s[i] = true; setSubmittedProblems(s);
    }
  };

  useEffect(() => {
    if (!jobId || !candidateId) { setLocation("/student/calls"); return; }
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLocation("/"); return; }
      authUserRef.current = user;
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(`${FASTAPI_URL}/api/dsa/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: jobId, candidate_id: candidateId, student_token: idToken }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to load problems");
        if (data.already_completed) {
          setLocation(`/student/dsa/results?job_id=${jobId}&candidate_id=${candidateId}`); return;
        }
        const ps: DSAProblem[] = data.problems;
        setProblems(ps);
        const initCodes = ps.map(p => p.starter_code_python || "");
        codesRef.current = initCodes;
        setCodes(initCodes);
        setPhase("instructions");
      } catch (err) {
        toast({ title: "Could not load DSA round", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
        setLocation("/student/calls");
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (phase !== "exam") return;
    const addViolation = (reason: string) => {
      violationsRef.current += 1;
      const count = violationsRef.current;
      setViolations(count);
      if (count >= MAX_VIOLATIONS) {
        setWarningMsg("Maximum violations reached. Submitting automatically.");
        setShowWarning(true);
        setTimeout(() => doSubmit(true), 2000);
      } else {
        setWarningMsg(`${reason} — Warning ${count} of ${MAX_VIOLATIONS}`);
        setShowWarning(true);
      }
    };
    const onVisibility = () => { if (document.hidden) addViolation("Tab switch detected"); };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F12" || (e.ctrlKey && e.shiftKey && ["I","J"].includes(e.key))) e.preventDefault();
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement && phaseRef.current === "exam") {
        addViolation("Fullscreen exited");
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "exam") return;
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        const next = t - 1;
        if (next <= 10 * 60) setTimeCritical(true);
        if (next <= 0) { clearInterval(timerRef.current); doSubmit(false); return 0; }
        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase]);

  const startExam = async () => {
    try { await document.documentElement.requestFullscreen(); } catch {}
    setPhase("exam");
  };

  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 size={36} className="animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Generating your DSA problems…</p>
          <p className="text-muted-foreground text-xs">This may take a moment</p>
        </div>
      </div>
    );
  }

  if (phase === "submitting") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-foreground font-medium">Running your code against test cases…</p>
          <p className="text-muted-foreground text-sm">Evaluating all 3 problems. This may take a moment.</p>
        </div>
      </div>
    );
  }

  if (phase === "instructions") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-card border border-border rounded-2xl max-w-lg w-full overflow-hidden shadow-lg">
          <div className="bg-gradient-to-r from-[#667eea]/10 to-[#764ba2]/10 border-b border-border px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center shrink-0">
                <BarChart3 size={18} className="text-white" />
              </div>
              <div>
                <h1 className="font-bold text-foreground text-lg">Stage 3 — DSA Coding Round</h1>
                <p className="text-muted-foreground text-xs">3 Problems · Live Code Editor · Test Runner</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Clock, label: `${EXAM_MINUTES} minutes`, sub: "Total time" },
                { icon: Code2, label: "3 problems", sub: "Easy · Medium · Hard" },
                { icon: Play, label: "Live compiler", sub: "Run & test code" },
                { icon: Lock, label: "3 violations max", sub: "Auto-submit on 3rd" },
              ].map(({ icon: Icon, label, sub }) => (
                <div key={label} className="bg-muted rounded-xl p-3 flex items-center gap-3">
                  <Icon size={16} className="text-primary shrink-0" />
                  <div>
                    <p className="text-foreground text-xs font-semibold">{label}</p>
                    <p className="text-muted-foreground text-[11px]">{sub}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {problems.map((p, i) => {
                const ds = DIFF_STYLES[p.difficulty as keyof typeof DIFF_STYLES] ?? DIFF_STYLES.Easy;
                return (
                  <div key={i} className={cn("rounded-xl border p-3 flex items-center gap-3", ds.border)}>
                    <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", ds.bg, ds.text)}>{p.difficulty}</span>
                    <span className="text-sm text-foreground font-medium">{p.title}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{p.category}</span>
                  </div>
                );
              })}
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2">
              <p className="text-amber-600 dark:text-amber-400 font-semibold text-sm flex items-center gap-2">
                <AlertTriangle size={14} /> Before you begin
              </p>
              <ul className="text-muted-foreground text-xs space-y-1.5">
                {[
                  "Write code in the editor — Python, JavaScript, Java, or C++ supported.",
                  "Click 'Run Code' to test against sample cases before submitting.",
                  "Click 'Submit All' in the top bar when done with all 3 problems.",
                  "The exam runs in fullscreen — exiting counts as a violation.",
                  "Scoring: Easy = 1pt, Medium = 2pts, Hard = 3pts (all tests must pass).",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <ChevronRight size={11} className="text-amber-500 mt-0.5 shrink-0" />{item}
                  </li>
                ))}
              </ul>
            </div>

            <Button onClick={startExam}
              className="w-full bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90 font-semibold h-11 gap-2">
              <Shield size={15} /> Start DSA Round
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  const problem = problems[activeProblem];
  const diffStyle = DIFF_STYLES[problem?.difficulty as keyof typeof DIFF_STYLES] ?? DIFF_STYLES.Easy;
  const currentLang = LANGUAGES.find(l => l.id === languages[activeProblem]) ?? LANGUAGES[0];
  const currentResults = runResults[activeProblem];

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 bg-card/95 backdrop-blur-sm border-b border-border h-13 flex items-center px-3 gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center">
            <BarChart3 size={12} className="text-white" />
          </div>
          <span className="font-bold text-xs hidden sm:block">DSA Round</span>
        </div>

        {/* Problem tabs */}
        <div className="flex items-center gap-1 flex-1 justify-center overflow-x-auto">
          {problems.map((p, i) => {
            const ds = DIFF_STYLES[p.difficulty as keyof typeof DIFF_STYLES] ?? DIFF_STYLES.Easy;
            const solved = submittedProblems[i];
            return (
              <button key={i} onClick={() => setActiveProblem(i)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap border",
                  activeProblem === i
                    ? "bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white border-transparent"
                    : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                )}>
                {solved && <CheckCircle2 size={10} className={activeProblem === i ? "text-white" : "text-green-500"} />}
                <span>P{i + 1}</span>
                <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                  activeProblem === i ? "bg-white/20 text-white" : `${ds.bg} ${ds.text}`)}>
                  {p.difficulty}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <motion.div animate={timeCritical ? { scale: [1, 1.05, 1] } : {}} transition={{ duration: 0.8, repeat: timeCritical ? Infinity : 0 }}
            className={cn("flex items-center gap-1 px-3 py-1 rounded-full font-mono font-bold text-xs border",
              timeCritical ? "bg-red-500/10 border-red-500/30 text-red-500" : "bg-muted border-border text-foreground")}>
            <Clock size={11} />{formatTime(timeLeft)}
          </motion.div>
          <div className={cn("flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border",
            violations > 0 ? "bg-amber-500/10 border-amber-500/30 text-amber-600" : "bg-muted border-border text-muted-foreground")}>
            <Eye size={10} />{violations}/{MAX_VIOLATIONS}
          </div>
          <Button onClick={() => doSubmit(false)} size="sm"
            className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90 gap-1 h-7 text-xs px-3">
            <Send size={11} /> Submit All
          </Button>
        </div>
      </div>

      {/* Main split layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT: Problem panel */}
        <div className="w-[42%] border-r border-border flex flex-col overflow-hidden">
          <div className={cn("shrink-0 px-4 py-2 border-b border-border flex items-center gap-2", diffStyle.bg)}>
            <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full bg-card/60", diffStyle.text)}>
              {problem?.difficulty}
            </span>
            <span className="text-xs font-semibold text-foreground truncate">{problem?.title}</span>
            <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{problem?.category}</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-sm">
            {/* Description */}
            <div>
              <p className="text-foreground leading-relaxed text-xs">{problem?.description}</p>
            </div>

            {/* I/O format */}
            {(problem?.input_format || problem?.output_format) && (
              <div className="space-y-2">
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Input Format</p>
                  <p className="text-xs text-foreground">{problem.input_format}</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Output Format</p>
                  <p className="text-xs text-foreground">{problem.output_format}</p>
                </div>
              </div>
            )}

            {/* Constraints */}
            {problem?.constraints?.length > 0 && (
              <div className="bg-muted rounded-lg p-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Constraints</p>
                <ul className="space-y-0.5">
                  {problem.constraints.map((c, i) => (
                    <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                      <span className="text-primary mt-0.5">•</span>{c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sample test cases */}
            {problem?.sample_test_cases?.map((tc, i) => (
              <div key={i} className="border border-border rounded-lg overflow-hidden">
                <div className="bg-muted px-3 py-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Example {i + 1}</span>
                  <span className="text-[10px] text-muted-foreground">{tc.description}</span>
                </div>
                <div className="grid grid-cols-2 divide-x divide-border">
                  <div className="p-3">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Input</p>
                    <pre className="text-xs text-foreground font-mono whitespace-pre-wrap">{tc.input}</pre>
                  </div>
                  <div className="p-3">
                    <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Expected Output</p>
                    <pre className="text-xs text-foreground font-mono whitespace-pre-wrap">{tc.expected_output}</pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Editor + results */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor toolbar */}
          <div className="shrink-0 bg-card border-b border-border px-3 py-1.5 flex items-center gap-2">
            <select
              value={languages[activeProblem]}
              onChange={(e) => updateLang(activeProblem, e.target.value)}
              className="bg-muted border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {LANGUAGES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            <span className="text-muted-foreground text-xs">{currentLang.label}</span>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={runCode} disabled={running}
              className="gap-1.5 h-7 text-xs px-3 border-green-500/40 text-green-600 hover:bg-green-500/10">
              {running ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
              {running ? "Running…" : "Run Code"}
            </Button>
          </div>

          {/* Monaco Editor */}
          <div className="flex-1 overflow-hidden">
            <Editor
              height="100%"
              language={currentLang.monaco}
              value={codes[activeProblem]}
              onChange={(val) => updateCode(activeProblem, val ?? "")}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineHeight: 20,
                padding: { top: 12 },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                automaticLayout: true,
                tabSize: 4,
                insertSpaces: true,
              }}
            />
          </div>

          {/* Test results panel */}
          <AnimatePresence>
            {currentResults && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                className="shrink-0 border-t border-border bg-card overflow-hidden">
                <div className="px-3 py-2 flex items-center gap-2 border-b border-border">
                  <Terminal size={12} className="text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">Test Results</span>
                  <div className="flex items-center gap-1 ml-auto">
                    {currentResults.map((r, i) => (
                      <div key={i} className={cn("w-2 h-2 rounded-full", r.passed ? "bg-green-500" : "bg-red-500")} />
                    ))}
                    <span className="text-xs text-muted-foreground ml-1">
                      {currentResults.filter(r => r.passed).length}/{currentResults.length} passed
                    </span>
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto p-2 space-y-1.5">
                  {currentResults.map((r, i) => (
                    <div key={i} className={cn(
                      "rounded-lg p-2 text-xs border",
                      r.passed ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"
                    )}>
                      <div className="flex items-center gap-2 mb-1">
                        {r.passed
                          ? <CheckCircle2 size={11} className="text-green-500 shrink-0" />
                          : <XCircle size={11} className="text-red-500 shrink-0" />}
                        <span className={cn("font-medium", r.passed ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                          Case {i + 1}: {r.passed ? "Passed" : "Failed"} — {r.description}
                        </span>
                      </div>
                      {!r.passed && (
                        <div className="ml-4 space-y-0.5">
                          <p className="text-muted-foreground font-mono">Got: <span className="text-foreground">{r.actual || "(no output)"}</span></p>
                          {r.stderr && <p className="text-red-500/80 font-mono truncate">{r.stderr}</p>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Violation modal */}
      <AnimatePresence>
        {showWarning && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-card border border-red-500/40 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
              <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 0.5, repeat: 2 }}>
                <AlertTriangle size={44} className="text-red-500 mx-auto mb-3" />
              </motion.div>
              <h3 className="text-lg font-bold text-red-500 mb-2">Violation Detected</h3>
              <p className="text-muted-foreground text-sm mb-3">{warningMsg}</p>
              <div className="flex justify-center gap-1.5 mb-4">
                {Array.from({ length: MAX_VIOLATIONS }).map((_, i) => (
                  <div key={i} className={cn("w-3 h-3 rounded-full", i < violations ? "bg-red-500" : "bg-muted")} />
                ))}
              </div>
              {violations < MAX_VIOLATIONS && (
                <Button onClick={() => setShowWarning(false)} className="w-full bg-red-600 hover:bg-red-700 text-white">
                  I Understand — Continue
                </Button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
