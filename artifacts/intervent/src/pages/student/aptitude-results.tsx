import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { motion } from "framer-motion";
import { XCircle, Clock, Trophy, ArrowLeft, Loader2, CalendarCheck, Brain } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AptitudeData {
  status: string;
  evaluation: {
    correct_count: number;
    total: number;
    percentage: number;
    passed: boolean;
    overall_feedback: string;
  } | null;
  violations?: number;
  time_taken_seconds?: number;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

export default function AptitudeResults() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const jobId = params.get("job_id") || "";
  const candidateId = params.get("candidate_id") || "";

  const [loading, setLoading] = useState(true);
  const [aptitude, setAptitude] = useState<AptitudeData | null>(null);

  useEffect(() => {
    if (!jobId || !candidateId) { setLocation("/student/calls"); return; }
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setLocation("/"); return; }
      try {
        const candSnap = await getDoc(doc(db, "jobs", jobId, "candidates", candidateId));
        if (!candSnap.exists()) { setLocation("/student/calls"); return; }
        const data = candSnap.data();
        if (!data.aptitude || data.aptitude.status !== "completed") {
          setLocation(`/student/aptitude?job_id=${jobId}&candidate_id=${candidateId}`);
          return;
        }
        setAptitude(data.aptitude as AptitudeData);
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

  if (!aptitude || !aptitude.evaluation) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-muted-foreground">No results found.</p>
          <Button variant="outline" className="mt-4" onClick={() => setLocation("/student/calls")}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const ev = aptitude.evaluation;
  const passed = ev.passed;
  const pct = ev.percentage;
  const scoreColor = pct >= 70 ? "text-green-500" : pct >= 50 ? "text-yellow-500" : "text-red-500";

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-5">

        <button
          onClick={() => setLocation("/student/calls")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={15} /> Back to Dashboard
        </button>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn("rounded-2xl border overflow-hidden shadow-sm", passed ? "border-green-500/30" : "border-red-500/30")}
        >
          <div className={cn(
            "px-6 py-6 text-center",
            passed ? "bg-gradient-to-b from-green-500/10 to-green-500/5" : "bg-gradient-to-b from-red-500/10 to-red-500/5"
          )}>
            <div className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4",
              passed ? "bg-green-500/20" : "bg-red-500/20"
            )}>
              {passed
                ? <Trophy size={30} className="text-green-500" />
                : <XCircle size={30} className="text-red-500" />
              }
            </div>

            <div className="flex items-center justify-center gap-2 mb-2">
              <Brain size={15} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Stage 2 — Aptitude</span>
            </div>

            <p className={cn("text-xl font-bold mb-2", passed ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
              {passed ? "Aptitude Test Passed!" : "Aptitude Test Not Passed"}
            </p>

            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
              {ev.overall_feedback}
            </p>

            <p className={cn("text-5xl font-bold tabular-nums mt-5", scoreColor)}>{pct}%</p>
            <p className="text-sm text-muted-foreground mt-1">{ev.correct_count}/{ev.total} correct</p>
          </div>

          <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
            <div className="py-4 text-center">
              <p className="text-lg font-bold text-foreground">{ev.correct_count}/{ev.total}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Correct</p>
            </div>
            <div className="py-4 text-center">
              <p className="text-lg font-bold text-foreground flex items-center justify-center gap-1">
                <Clock size={13} className="text-muted-foreground" />
                {aptitude.time_taken_seconds ? formatDuration(aptitude.time_taken_seconds) : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Time Taken</p>
            </div>
            <div className="py-4 text-center">
              <p className={cn("text-lg font-bold", (aptitude.violations ?? 0) > 0 ? "text-amber-500" : "text-foreground")}>
                {aptitude.violations ?? 0}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Violations</p>
            </div>
          </div>
        </motion.div>

        {passed ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <CalendarCheck size={20} className="text-blue-500 shrink-0" />
              <div>
                <p className="font-semibold text-blue-700 dark:text-blue-400 text-sm">Stage 2 Complete!</p>
                <p className="text-xs text-muted-foreground mt-0.5">The HR team will contact you about the final interview.</p>
              </div>
            </div>
            <Button onClick={() => setLocation("/student/calls")} size="sm" className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs">
              Dashboard
            </Button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl border border-border bg-muted/40 p-4 text-center"
          >
            <p className="text-sm text-muted-foreground">
              Keep practising aptitude skills and check back for future opportunities.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setLocation("/student/calls")}>
              <ArrowLeft size={13} className="mr-1.5" /> Back to Dashboard
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
