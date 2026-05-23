import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { motion } from "framer-motion";
import {
  XCircle, Clock, Trophy, ArrowLeft, Loader2, CalendarCheck,
  BarChart3, CheckCircle2, Terminal
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProblemResult {
  problem_index: number;
  title: string;
  difficulty: string;
  submitted: boolean;
  passed_count: number;
  total_tests: number;
  score: number;
  max_score: number;
}

interface DSAData {
  status: string;
  evaluation: {
    per_problem: ProblemResult[];
    total_score: number;
    max_score: number;
    percentage: number;
    passed: boolean;
    passed_problems: number;
    overall_feedback: string;
  } | null;
  violations?: number;
  time_taken_seconds?: number;
}

const DIFF_STYLES = {
  Easy:   { bg: "bg-green-500/15",  text: "text-green-600 dark:text-green-400",  border: "border-green-500/30" },
  Medium: { bg: "bg-yellow-500/15", text: "text-yellow-600 dark:text-yellow-400", border: "border-yellow-500/30" },
  Hard:   { bg: "bg-red-500/15",    text: "text-red-600 dark:text-red-400",    border: "border-red-500/30" },
};

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export default function DSAResults() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const jobId = params.get("job_id") || "";
  const candidateId = params.get("candidate_id") || "";

  const [loading, setLoading] = useState(true);
  const [dsa, setDsa] = useState<DSAData | null>(null);

  useEffect(() => {
    if (!jobId || !candidateId) { setLocation("/student/calls"); return; }
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLocation("/"); return; }
      try {
        const snap = await getDoc(doc(db, "jobs", jobId, "candidates", candidateId));
        if (!snap.exists()) { setLocation("/student/calls"); return; }
        const data = snap.data();
        if (!data.dsa || data.dsa.status !== "completed") {
          setLocation(`/student/dsa?job_id=${jobId}&candidate_id=${candidateId}`); return;
        }
        setDsa(data.dsa as DSAData);
      } catch {
        setLocation("/student/calls");
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!dsa || !dsa.evaluation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-muted-foreground">No results found.</p>
          <Button variant="outline" className="mt-4" onClick={() => setLocation("/student/calls")}>Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  const ev = dsa.evaluation;
  const passed = ev.passed;
  const pct = ev.percentage;
  const scoreColor = pct >= 70 ? "text-green-500" : pct >= 50 ? "text-yellow-500" : "text-red-500";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-5">
        <button onClick={() => setLocation("/student/calls")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={15} /> Back to Dashboard
        </button>

        {/* Main result card */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          className={cn("rounded-2xl border overflow-hidden shadow-sm", passed ? "border-green-500/30" : "border-red-500/30")}>
          <div className={cn("px-6 py-6 text-center",
            passed ? "bg-gradient-to-b from-green-500/10 to-green-500/5" : "bg-gradient-to-b from-red-500/10 to-red-500/5")}>
            <div className={cn("w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4",
              passed ? "bg-green-500/20" : "bg-red-500/20")}>
              {passed ? <Trophy size={30} className="text-green-500" /> : <XCircle size={30} className="text-red-500" />}
            </div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <BarChart3 size={15} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Stage 3 — DSA Round</span>
            </div>
            <p className={cn("text-xl font-bold mb-2", passed ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
              {passed ? "DSA Round Passed!" : "DSA Round Not Passed"}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{ev.overall_feedback}</p>
            <p className={cn("text-5xl font-bold tabular-nums mt-5", scoreColor)}>{pct}%</p>
            <p className="text-sm text-muted-foreground mt-1">{ev.total_score}/{ev.max_score} pts · {ev.passed_problems}/3 problems solved</p>
          </div>

          <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
            <div className="py-4 text-center">
              <p className="text-lg font-bold text-foreground">{ev.passed_problems}/3</p>
              <p className="text-xs text-muted-foreground mt-0.5">Solved</p>
            </div>
            <div className="py-4 text-center">
              <p className="text-lg font-bold text-foreground flex items-center justify-center gap-1">
                <Clock size={13} className="text-muted-foreground" />
                {dsa.time_taken_seconds ? formatDuration(dsa.time_taken_seconds) : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Time Taken</p>
            </div>
            <div className="py-4 text-center">
              <p className={cn("text-lg font-bold", (dsa.violations ?? 0) > 0 ? "text-amber-500" : "text-foreground")}>
                {dsa.violations ?? 0}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Violations</p>
            </div>
          </div>
        </motion.div>

        {/* Per-problem breakdown */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">Problem Breakdown</p>
          {ev.per_problem.map((p, i) => {
            const ds = DIFF_STYLES[p.difficulty as keyof typeof DIFF_STYLES] ?? DIFF_STYLES.Easy;
            const allPassed = p.submitted && p.passed_count === p.total_tests && p.total_tests > 0;
            const partial = p.submitted && p.passed_count > 0 && p.passed_count < p.total_tests;
            return (
              <div key={i} className={cn("rounded-xl border p-3 flex items-center gap-3",
                allPassed ? "border-green-500/30 bg-green-500/5"
                : partial ? "border-yellow-500/30 bg-yellow-500/5"
                : p.submitted ? "border-red-500/20 bg-red-500/5"
                : "border-border bg-muted/30")}>
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  allPassed ? "bg-green-500/20" : partial ? "bg-yellow-500/20" : p.submitted ? "bg-red-500/20" : "bg-muted")}>
                  {allPassed
                    ? <CheckCircle2 size={16} className="text-green-500" />
                    : p.submitted
                      ? <Terminal size={16} className={partial ? "text-yellow-500" : "text-red-500"} />
                      : <XCircle size={16} className="text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground truncate">{p.title}</span>
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full", ds.bg, ds.text)}>{p.difficulty}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.submitted
                      ? `${p.passed_count}/${p.total_tests} test cases passed`
                      : "Not submitted"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-foreground">{p.score}/{p.max_score}</p>
                  <p className="text-[10px] text-muted-foreground">pts</p>
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* Next step */}
        {passed ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CalendarCheck size={20} className="text-blue-500 shrink-0" />
              <div>
                <p className="font-semibold text-blue-700 dark:text-blue-400 text-sm">All 3 Stages Complete!</p>
                <p className="text-xs text-muted-foreground mt-0.5">The HR team will contact you to schedule your final interview.</p>
              </div>
            </div>
            <Button onClick={() => setLocation("/student/calls")} size="sm"
              className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs">Dashboard</Button>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="rounded-2xl border border-border bg-muted/40 p-4 text-center">
            <p className="text-sm text-muted-foreground">Keep practising DSA and check back for future opportunities.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setLocation("/student/calls")}>
              <ArrowLeft size={13} className="mr-1.5" /> Back to Dashboard
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
