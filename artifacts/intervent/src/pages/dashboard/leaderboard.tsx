import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "@/lib/firebase";
import { motion } from "framer-motion";
import {
  ArrowLeft, Trophy, Medal, Crown, Clock, CheckCircle2,
  AlertCircle, Loader2, Users, BarChart3, Brain, Code2, Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface JobMeta {
  job_id: string;
  job_title: string;
  hr_name: string;
  application_deadline?: string;
  pooling_type?: string;
  total_candidates?: number;
}

interface Candidate {
  candidate_id: string;
  name: string;
  email: string;
  screening_result: "shortlisted" | "rejected" | null;
  assessment?: { evaluation?: { percentage: number; passed: boolean } };
  aptitude?: { evaluation?: { percentage: number; passed: boolean } };
  dsa?: { evaluation?: { percentage: number; passed: boolean } };
  meet_interview?: { evaluation?: { overall_score: number; hr_score: number; technical_score: number; recommendation: string; passed: boolean } };
}

interface RankedCandidate extends Candidate {
  compositeScore: number;
  stagesCompleted: number;
}

function useQueryParam(key: string) {
  return new URLSearchParams(window.location.search).get(key) || "";
}

function isDeadlinePassed(deadline: string | undefined): boolean {
  if (!deadline) return false;
  const d = new Date(deadline);
  d.setHours(23, 59, 59, 999);
  return d < new Date();
}

function formatDate(ts: string | undefined) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch { return ts; }
}

function calcCompositeScore(c: Candidate): { score: number; stages: number } {
  const scores: number[] = [];
  if (c.assessment?.evaluation?.percentage !== undefined) scores.push(c.assessment.evaluation.percentage);
  if (c.aptitude?.evaluation?.percentage !== undefined) scores.push(c.aptitude.evaluation.percentage);
  if (c.dsa?.evaluation?.percentage !== undefined) scores.push(c.dsa.evaluation.percentage);
  if (c.meet_interview?.evaluation?.overall_score !== undefined) scores.push(c.meet_interview.evaluation.overall_score);
  if (scores.length === 0) return { score: 0, stages: 0 };
  return {
    score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    stages: scores.length,
  };
}

function MedalIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown size={22} className="text-yellow-500" />;
  if (rank === 2) return <Medal size={22} className="text-slate-400" />;
  if (rank === 3) return <Medal size={22} className="text-amber-600" />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">#{rank}</span>;
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", color)}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <span className="text-xs font-medium tabular-nums w-8 text-right">{value}%</span>
    </div>
  );
}

function CandidateRow({
  candidate,
  rank,
  isWinner,
  index,
}: {
  candidate: RankedCandidate;
  rank: number;
  isWinner: boolean;
  index: number;
}) {
  const [expanded, setExpanded] = useState(rank <= 3);
  const ev = candidate.meet_interview?.evaluation;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className={cn(
        "rounded-2xl border overflow-hidden transition-all",
        isWinner
          ? "border-yellow-500/40 bg-gradient-to-r from-yellow-500/5 to-amber-500/5 shadow-md shadow-yellow-500/10"
          : rank === 2
            ? "border-slate-400/30 bg-slate-500/5"
            : rank === 3
              ? "border-amber-600/30 bg-amber-500/5"
              : "border-border bg-card"
      )}
    >
      <button
        className="w-full text-left px-5 py-4 flex items-center gap-4"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="w-9 flex items-center justify-center shrink-0">
          <MedalIcon rank={rank} />
        </div>

        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
          isWinner ? "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400" :
            rank === 2 ? "bg-slate-400/20 text-slate-600" :
              rank === 3 ? "bg-amber-500/20 text-amber-700" :
                "bg-primary/10 text-primary"
        )}>
          {candidate.name?.charAt(0)?.toUpperCase() || "?"}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm truncate">{candidate.name || "Unknown"}</p>
            {isWinner && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30">
                SELECTED
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">
              {candidate.stagesCompleted} stage{candidate.stagesCompleted !== 1 ? "s" : ""} completed
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{candidate.email}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className={cn(
            "text-2xl font-black tabular-nums",
            isWinner ? "text-yellow-600 dark:text-yellow-400" :
              candidate.compositeScore >= 70 ? "text-green-600 dark:text-green-400" :
                candidate.compositeScore >= 50 ? "text-amber-600" : "text-red-500"
          )}>
            {candidate.compositeScore}
          </p>
          <p className="text-[10px] text-muted-foreground">/ 100</p>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t border-border/50 pt-3">
          {candidate.assessment?.evaluation && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Code2 size={11} className="text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground font-medium">Assessment (S1)</span>
              </div>
              <ScoreBar value={candidate.assessment.evaluation.percentage} color="bg-blue-500" />
            </div>
          )}
          {candidate.aptitude?.evaluation && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Brain size={11} className="text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground font-medium">Aptitude (S2)</span>
              </div>
              <ScoreBar value={candidate.aptitude.evaluation.percentage} color="bg-purple-500" />
            </div>
          )}
          {candidate.dsa?.evaluation && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <BarChart3 size={11} className="text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground font-medium">DSA (S3)</span>
              </div>
              <ScoreBar value={candidate.dsa.evaluation.percentage} color="bg-emerald-500" />
            </div>
          )}
          {ev && (
            <div className="space-y-2">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <Mic size={11} className="text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground font-medium">Interview (S4) — Overall</span>
                </div>
                <ScoreBar value={ev.overall_score} color="bg-violet-500" />
              </div>
              <div className="grid grid-cols-2 gap-2 pl-4">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-0.5">HR / Behavioural</p>
                  <ScoreBar value={ev.hr_score} color="bg-violet-400" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-0.5">Technical</p>
                  <ScoreBar value={ev.technical_score} color="bg-indigo-400" />
                </div>
              </div>
            </div>
          )}
          {candidate.stagesCompleted === 0 && (
            <p className="text-xs text-muted-foreground italic">No stage scores yet — screening only.</p>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default function LeaderboardPage() {
  const job_id = useQueryParam("job_id");
  const [, setLocation] = useLocation();
  const [job, setJob] = useState<JobMeta | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) setLocation("/");
    });
    return () => unsub();
  }, [setLocation]);

  useEffect(() => {
    if (!job_id) return;
    getDoc(doc(db, "jobs", job_id)).then((d) => {
      if (d.exists()) setJob({ job_id: d.id, ...(d.data() as Omit<JobMeta, "job_id">) });
    });
  }, [job_id]);

  useEffect(() => {
    if (!job_id) return;
    const unsub = onSnapshot(collection(db, "jobs", job_id, "candidates"), (snap) => {
      setCandidates(snap.docs.map((d) => ({ candidate_id: d.id, ...(d.data() as Omit<Candidate, "candidate_id">) })));
      setLoading(false);
    });
    return () => unsub();
  }, [job_id]);

  const ranked: RankedCandidate[] = candidates
    .filter((c) => c.screening_result === "shortlisted")
    .map((c) => {
      const { score, stages } = calcCompositeScore(c);
      return { ...c, compositeScore: score, stagesCompleted: stages };
    })
    .sort((a, b) => b.compositeScore - a.compositeScore);

  const deadline = job?.application_deadline;
  const deadlinePassed = isDeadlinePassed(deadline);
  const winner = deadlinePassed && ranked.length > 0 ? ranked[0] : null;

  if (!job_id) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground">No job selected.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard/manager")} className="shrink-0 mt-0.5">
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Trophy size={20} className="text-yellow-500 shrink-0" />
            <h2 className="text-2xl font-bold truncate">{job?.job_title || "Leaderboard"}</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {job?.hr_name} · {ranked.length} ranked candidate{ranked.length !== 1 ? "s" : ""}
            {deadline && ` · Deadline: ${formatDate(deadline)}`}
          </p>
        </div>
      </div>

      {deadlinePassed ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-yellow-500/30 bg-gradient-to-r from-yellow-500/10 via-amber-500/10 to-orange-500/10 p-5 flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0">
            <Trophy size={24} className="text-yellow-500" />
          </div>
          <div>
            <p className="font-bold text-yellow-700 dark:text-yellow-400">Final Rankings — Deadline Passed</p>
            <p className="text-sm text-yellow-600/80 dark:text-yellow-500/80 mt-0.5">
              {winner
                ? `Top candidate: ${winner.name} with a composite score of ${winner.compositeScore}/100`
                : "No candidates have completed stages yet."}
            </p>
          </div>
        </motion.div>
      ) : deadline ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 p-5 flex items-center gap-4"
        >
          <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
            <Clock size={22} className="text-blue-500" />
          </div>
          <div>
            <p className="font-semibold text-blue-700 dark:text-blue-400">Live Rankings — Applications Open</p>
            <p className="text-sm text-blue-600/80 dark:text-blue-500/80 mt-0.5">
              Rankings update in real-time. Final selection locks after {formatDate(deadline)}.
              No candidate is permanently selected until the deadline passes.
            </p>
          </div>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl border border-border bg-muted/30 p-5 flex items-center gap-3"
        >
          <AlertCircle size={18} className="text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">No deadline set — rankings are informational only.</p>
        </motion.div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : ranked.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-2xl border border-dashed border-border bg-muted/30 p-12 text-center">
          <Users size={36} className="mx-auto text-muted-foreground mb-3" />
          <p className="font-medium text-muted-foreground">No shortlisted candidates yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Run screening on the Job Manager page to populate rankings.</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {ranked.map((c, i) => (
            <CandidateRow
              key={c.candidate_id}
              candidate={c}
              rank={i + 1}
              isWinner={deadlinePassed && i === 0}
              index={i}
            />
          ))}
        </div>
      )}

      {deadlinePassed && winner && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border border-green-500/30 bg-gradient-to-r from-green-500/10 to-emerald-500/10 p-6 flex items-center gap-4"
        >
          <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
            <CheckCircle2 size={28} className="text-green-500" />
          </div>
          <div>
            <p className="font-bold text-green-700 dark:text-green-400 text-lg">
              {winner.name} — Selected!
            </p>
            <p className="text-sm text-green-600/80 dark:text-green-500/80 mt-0.5">
              Composite score: <strong>{winner.compositeScore}/100</strong> across {winner.stagesCompleted} stage{winner.stagesCompleted !== 1 ? "s" : ""}.
              Use the Interview Manager to send the offer email.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
