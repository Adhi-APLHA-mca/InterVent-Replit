import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { onAuthStateChanged } from "firebase/auth";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle, Clock, Shield, Send, Loader2,
  Eye, Code2, ChevronRight, Lock, ChevronLeft, CheckSquare
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const FASTAPI_URL = import.meta.env.VITE_FASTAPI_URL || "";
const EXAM_MINUTES = 25;
const MAX_VIOLATIONS = 3;
const OPTIONS = ["A", "B", "C", "D"] as const;

interface TechQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  category: string;
}

const CATEGORY_STYLES: Record<string, { bg: string; text: string; bar: string }> = {
  "Core Programming":              { bg: "bg-blue-500/15",   text: "text-blue-600 dark:text-blue-400",   bar: "bg-blue-500" },
  "Web & APIs":                    { bg: "bg-teal-500/15",   text: "text-teal-600 dark:text-teal-400",   bar: "bg-teal-500" },
  "Databases":                     { bg: "bg-orange-500/15", text: "text-orange-600 dark:text-orange-400", bar: "bg-orange-500" },
  "Data Structures & Algorithms":  { bg: "bg-purple-500/15", text: "text-purple-600 dark:text-purple-400", bar: "bg-purple-500" },
  "Domain Knowledge":              { bg: "bg-green-500/15",  text: "text-green-600 dark:text-green-400",  bar: "bg-green-500" },
};
const DEFAULT_STYLE = { bg: "bg-muted", text: "text-muted-foreground", bar: "bg-muted-foreground" };

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function AssessmentPage() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const jobId = params.get("job_id") || "";
  const candidateId = params.get("candidate_id") || "";
  const { toast } = useToast();

  type Phase = "loading" | "instructions" | "exam" | "submitting";
  const [phase, setPhase] = useState<Phase>("loading");
  const [questions, setQuestions] = useState<TechQuestion[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [timeLeft, setTimeLeft] = useState(EXAM_MINUTES * 60);
  const [violations, setViolations] = useState(0);
  const [showWarning, setShowWarning] = useState(false);
  const [warningMsg, setWarningMsg] = useState("");
  const [timeCritical, setTimeCritical] = useState(false);

  const selectedRef = useRef<string[]>([]);
  const violationsRef = useRef(0);
  const phaseRef = useRef<Phase>("loading");
  const authUserRef = useRef<ReturnType<typeof auth.currentUser>>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const startTimeRef = useRef<number>(Date.now());

  phaseRef.current = phase;

  const pickAnswer = (qIndex: number, option: string) => {
    const next = [...selectedRef.current];
    next[qIndex] = option;
    selectedRef.current = next;
    setSelected([...next]);
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
      const res = await fetch(`${FASTAPI_URL}/api/assessment/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId, candidate_id: candidateId, student_token: idToken,
          selected_answers: selectedRef.current,
          time_taken_seconds: elapsed,
          violations: violationsRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Submission failed");
      setLocation(`/student/assessment/results?job_id=${jobId}&candidate_id=${candidateId}`);
    } catch {
      toast({ title: "Submission failed", description: "Please try again.", variant: "destructive" });
      setPhase("exam");
    }
  };

  useEffect(() => {
    if (!jobId || !candidateId) { setLocation("/student/calls"); return; }
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLocation("/"); return; }
      authUserRef.current = user;
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(`${FASTAPI_URL}/api/assessment/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: jobId, candidate_id: candidateId, student_token: idToken }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to load questions");
        if (data.already_completed) {
          setLocation(`/student/assessment/results?job_id=${jobId}&candidate_id=${candidateId}`);
          return;
        }
        const qs: TechQuestion[] = data.questions;
        setQuestions(qs);
        selectedRef.current = Array(qs.length).fill("");
        setSelected(Array(qs.length).fill(""));
        setPhase("instructions");
      } catch (err) {
        toast({ title: "Could not load assessment", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
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
      if (e.key === "F12" || (e.ctrlKey && e.shiftKey && ["I","J","C"].includes(e.key))) e.preventDefault();
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
        if (next <= 5 * 60) setTimeCritical(true);
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

  const answeredCount = selected.filter(s => s !== "").length;

  if (phase === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 size={36} className="animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">Generating your technical assessment…</p>
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
          <p className="text-foreground font-medium">Submitting your assessment…</p>
          <p className="text-muted-foreground text-sm">Evaluating answers. Just a moment.</p>
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
                <Code2 size={18} className="text-white" />
              </div>
              <div>
                <h1 className="font-bold text-foreground text-lg">Stage 1 — Technical Assessment</h1>
                <p className="text-muted-foreground text-xs">MCQ Knowledge Test — InterVent Proctored</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Clock,  label: `${EXAM_MINUTES} minutes`, sub: "Total time" },
                { icon: Code2,  label: "15 questions",            sub: "MCQ format" },
                { icon: Shield, label: "Proctored",               sub: "AI-monitored" },
                { icon: Lock,   label: "3 violations max",        sub: "Auto-submit on 3rd" },
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

            <div className="bg-muted/60 border border-border rounded-xl p-4 space-y-2">
              <p className="text-foreground font-semibold text-sm">5 topics covered:</p>
              <div className="flex flex-wrap gap-2">
                {["Core Programming","Web & APIs","Databases","Data Structures & Algorithms","Domain Knowledge"].map((cat) => {
                  const s = CATEGORY_STYLES[cat] ?? DEFAULT_STYLE;
                  return (
                    <span key={cat} className={cn("text-[11px] font-medium px-2.5 py-1 rounded-full", s.bg, s.text)}>{cat}</span>
                  );
                })}
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-2">
              <p className="text-amber-600 dark:text-amber-400 font-semibold text-sm flex items-center gap-2">
                <AlertTriangle size={14} /> Before you begin
              </p>
              <ul className="text-muted-foreground text-xs space-y-1.5">
                {[
                  "This is a technical knowledge MCQ test — no coding required.",
                  "Select the best answer from A, B, C, D for each question.",
                  "The exam runs in fullscreen — do not exit.",
                  "Switching tabs counts as a violation (max 3).",
                  "Navigate freely — revisit any question before submitting.",
                  "The timer starts when you click Start.",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <ChevronRight size={11} className="text-amber-500 mt-0.5 shrink-0" />{item}
                  </li>
                ))}
              </ul>
            </div>

            <Button onClick={startExam}
              className="w-full bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90 font-semibold h-11 gap-2">
              <Shield size={15} /> Start Technical Assessment
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  const q = questions[currentQ];
  const cat = q?.category ?? "";
  const catStyle = CATEGORY_STYLES[cat] ?? DEFAULT_STYLE;
  const isFirst = currentQ === 0;
  const isLast = currentQ === questions.length - 1;
  const progressPct = questions.length > 0 ? ((currentQ + 1) / questions.length) * 100 : 0;
  const optionTexts: Record<string, string> = {
    A: q?.option_a ?? "", B: q?.option_b ?? "", C: q?.option_c ?? "", D: q?.option_d ?? "",
  };

  return (
    <div className="min-h-screen bg-background text-foreground select-none flex flex-col">
      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border h-14 flex items-center px-4 lg:px-6 gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center">
            <Code2 size={13} className="text-white" />
          </div>
          <span className="font-bold text-sm hidden sm:block">Technical Assessment</span>
        </div>
        <div className="flex-1 flex justify-center">
          <motion.div animate={timeCritical ? { scale: [1, 1.05, 1] } : {}} transition={{ duration: 0.8, repeat: timeCritical ? Infinity : 0 }}
            className={cn("flex items-center gap-2 px-4 py-1.5 rounded-full font-mono font-bold text-sm border",
              timeCritical ? "bg-red-500/10 border-red-500/30 text-red-500" : "bg-muted border-border text-foreground")}>
            <Clock size={13} />{formatTime(timeLeft)}
          </motion.div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className={cn("flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border",
            violations > 0 ? violations >= MAX_VIOLATIONS - 1
              ? "bg-red-500/10 border-red-500/30 text-red-500"
              : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
            : "bg-muted border-border text-muted-foreground")}>
            <Eye size={12} />{violations}/{MAX_VIOLATIONS}
          </div>
          <Button onClick={() => doSubmit(false)} size="sm"
            className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90 gap-1.5 h-8">
            <Send size={12} /> Submit
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="fixed top-14 left-0 right-0 z-40 h-1 bg-border">
        <motion.div className="h-full bg-gradient-to-r from-[#667eea] to-[#764ba2]"
          animate={{ width: `${progressPct}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
      </div>

      <div className="flex-1 pt-16 flex flex-col items-center justify-center px-4 py-6">
        <div className="w-full max-w-2xl space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm font-medium">
              Question <span className="text-foreground font-bold">{currentQ + 1}</span> of {questions.length}
            </p>
            <div className="flex items-center gap-1.5">
              <CheckSquare size={13} className="text-muted-foreground" />
              <span className="text-muted-foreground text-xs">{answeredCount}/{questions.length} answered</span>
            </div>
          </div>

          <div className="flex gap-1 flex-wrap">
            {questions.map((_, i) => (
              <button key={i} onClick={() => setCurrentQ(i)} title={`Q${i + 1}`}
                className={cn("w-5 h-5 rounded-sm text-[9px] font-bold transition-all",
                  i === currentQ ? "bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white scale-110"
                  : selected[i] ? "bg-green-500/80 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80")}>
                {i + 1}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={currentQ} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}
              className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
              <div className={cn("h-1 w-full", catStyle.bar)} />
              <div className="px-5 pt-4 pb-3 border-b border-border">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs font-bold text-muted-foreground">Q{currentQ + 1}</span>
                  <span className={cn("text-[11px] font-semibold px-2.5 py-0.5 rounded-full", catStyle.bg, catStyle.text)}>{cat}</span>
                </div>
                <p className="text-foreground text-sm leading-relaxed">{q?.question_text}</p>
              </div>
              <div className="p-4 space-y-2.5">
                {OPTIONS.map((opt) => {
                  const isSelected = selected[currentQ] === opt;
                  return (
                    <button key={opt} onClick={() => pickAnswer(currentQ, opt)}
                      className={cn("w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-all",
                        isSelected ? "border-[#667eea] bg-[#667eea]/10 text-foreground"
                        : "border-border bg-muted/40 text-foreground hover:bg-muted hover:border-border/80")}>
                      <span className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all",
                        isSelected ? "bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white"
                        : "bg-muted text-muted-foreground border border-border")}>
                        {opt}
                      </span>
                      <span>{optionTexts[opt]}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between pt-1">
            <Button variant="outline" onClick={() => setCurrentQ(currentQ - 1)} disabled={isFirst} className="gap-2 disabled:opacity-30">
              <ChevronLeft size={15} /> Previous
            </Button>
            {isLast ? (
              <Button onClick={() => doSubmit(false)}
                className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90 font-semibold gap-2 px-6">
                <Send size={14} /> Submit Assessment
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setCurrentQ(currentQ + 1)} className="gap-2">
                Next <ChevronRight size={15} />
              </Button>
            )}
          </div>
        </div>
      </div>

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
