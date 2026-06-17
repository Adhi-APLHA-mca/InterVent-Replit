import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  collection, onSnapshot, query, where,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  ArrowLeft, Briefcase, Users, CheckCircle2, XCircle,
  Clock, Loader2, Mail, ChevronRight, CalendarPlus,
  Sparkles, Send, RefreshCw, Code2, Trophy, AlertCircle, Brain, BarChart3, Video, Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { auth, db } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const FASTAPI_URL = import.meta.env.VITE_FASTAPI_URL || "";

interface Job {
  job_id: string;
  job_title: string;
  job_description: string;
  hr_uid: string;
  hr_name: string;
  total_candidates: number;
  total_shortlisted: number;
  total_rejected: number;
  status: string;
  screening_status: "pending" | "running" | "done";
  emails_sent: boolean;
  created_at: string;
}

interface Candidate {
  candidate_id: string;
  name: string;
  email: string;
  phone: string;
  skills: string[];
  experience: number;
  education: string;
  job_role: string;
  status: string;
  screening_result: "shortlisted" | "rejected" | null;
  screening_reason: string;
  email_sent: boolean;
  created_at: string;
  assessment?: {
    status: "in_progress" | "completed";
    evaluation?: {
      percentage: number;
      passed: boolean;
      total_score: number;
      max_score: number;
      overall_feedback: string;
    };
    violations?: number;
    time_taken_seconds?: number;
    completed_at?: string;
  };
  aptitude?: {
    status: "in_progress" | "completed";
    evaluation?: {
      percentage: number;
      passed: boolean;
      correct_count: number;
      total: number;
      overall_feedback: string;
    };
    violations?: number;
    time_taken_seconds?: number;
    completed_at?: string;
  };
  dsa?: {
    status: "in_progress" | "completed";
    evaluation?: {
      percentage: number;
      passed: boolean;
      passed_problems: number;
      total_score: number;
      max_score: number;
    };
    violations?: number;
    time_taken_seconds?: number;
    completed_at?: string;
  };
  meet_interview?: {
    status: "in_progress" | "completed";
    evaluation?: {
      overall_score: number;
      hr_score: number;
      technical_score: number;
      recommendation: "selected" | "not_selected";
      passed: boolean;
      summary: string;
      strengths: string[];
      improvements: string[];
    };
    completed_at?: string;
    time_taken_seconds?: number;
  };
  meet_selection_email_sent?: boolean;
}

function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch {
    return iso;
  }
}

function ScreeningStatusBadge({ status }: { status: Job["screening_status"] }) {
  if (status === "done") {
    return (
      <Badge className="bg-green-500/15 text-green-600 border-green-500/30 border gap-1">
        <CheckCircle2 size={11} /> Screened
      </Badge>
    );
  }
  if (status === "running") {
    return (
      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 border gap-1">
        <Loader2 size={11} className="animate-spin" /> Running
      </Badge>
    );
  }
  return (
    <Badge className="bg-muted text-muted-foreground border-border border gap-1">
      <Clock size={11} /> Pending
    </Badge>
  );
}

// ── Animated "Agent Working" Banner ──────────────────────────────────────────
function AgentWorkingBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 p-6"
    >
      {/* Shimmer sweep */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
        animate={{ x: ["-100%", "200%"] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
      />
      <div className="relative flex items-center gap-4">
        <div className="relative shrink-0">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
            <Sparkles size={22} className="text-amber-500" />
          </div>
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-amber-400"
            animate={{ scale: [1, 1.4, 1], opacity: [1, 0, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
        </div>
        <div>
          <p className="font-semibold text-amber-700 dark:text-amber-400">
            Stage 1 — Analyse Agent Working…
          </p>
          <p className="text-sm text-amber-600/80 dark:text-amber-500/80 mt-0.5">
            Reviewing each resume against the job description. This may take a moment.
          </p>
          <div className="flex gap-1 mt-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-amber-500"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Screening Success Banner ──────────────────────────────────────────────────
function ScreeningDoneBanner({ shortlisted, rejected }: { shortlisted: number; rejected: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-green-500/30 bg-gradient-to-r from-green-500/10 to-emerald-500/10 p-5 flex items-center gap-4"
    >
      <div className="w-11 h-11 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
        <CheckCircle2 size={22} className="text-green-500" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-green-700 dark:text-green-400">
          Stage 1 — Screening Complete ✓
        </p>
        <p className="text-sm text-green-600/80 dark:text-green-500/80 mt-0.5">
          Agent analysed all resumes against the JD.{" "}
          <span className="font-medium">{shortlisted} shortlisted</span>,{" "}
          <span className="font-medium">{rejected} rejected</span>.
        </p>
      </div>
    </motion.div>
  );
}

// ── Candidate Card ────────────────────────────────────────────────────────────
function CandidateCard({ candidate }: { candidate: Candidate }) {
  const isShortlisted = candidate.screening_result === "shortlisted";
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "flex items-start gap-3 p-4 rounded-xl border transition-colors",
        isShortlisted
          ? "bg-green-500/5 border-green-500/20"
          : "bg-red-500/5 border-red-500/20"
      )}
    >
      <div
        className={cn(
          "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
          isShortlisted ? "bg-green-500/20 text-green-600" : "bg-red-500/20 text-red-500"
        )}
      >
        {candidate.name?.charAt(0)?.toUpperCase() || "?"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm">{candidate.name || "Unknown"}</p>
          {isShortlisted ? (
            <Badge className="bg-green-500/15 text-green-600 border-green-500/30 border text-[10px] px-1.5 py-0 h-4">
              Shortlisted
            </Badge>
          ) : (
            <Badge className="bg-red-500/15 text-red-500 border-red-500/30 border text-[10px] px-1.5 py-0 h-4">
              Rejected
            </Badge>
          )}
          {candidate.email_sent && (
            <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/30 border text-[10px] px-1.5 py-0 h-4 gap-0.5">
              <Mail size={9} /> Email Sent
            </Badge>
          )}
          {candidate.assessment?.status === "in_progress" && (
            <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 border text-[10px] px-1.5 py-0 h-4 gap-0.5">
              <Code2 size={9} /> Test In Progress
            </Badge>
          )}
          {candidate.assessment?.status === "completed" && candidate.assessment.evaluation?.passed && (
            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 border text-[10px] px-1.5 py-0 h-4 gap-0.5">
              <Trophy size={9} /> S1 Passed {candidate.assessment.evaluation.percentage}%
            </Badge>
          )}
          {candidate.assessment?.status === "completed" && candidate.assessment.evaluation && !candidate.assessment.evaluation.passed && (
            <Badge className="bg-red-500/15 text-red-500 border-red-500/30 border text-[10px] px-1.5 py-0 h-4 gap-0.5">
              <AlertCircle size={9} /> S1 Failed {candidate.assessment.evaluation.percentage}%
            </Badge>
          )}
          {candidate.aptitude?.status === "in_progress" && (
            <Badge className="bg-purple-500/15 text-purple-600 border-purple-500/30 border text-[10px] px-1.5 py-0 h-4 gap-0.5">
              <Brain size={9} /> Aptitude In Progress
            </Badge>
          )}
          {candidate.aptitude?.status === "completed" && candidate.aptitude.evaluation?.passed && (
            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 border text-[10px] px-1.5 py-0 h-4 gap-0.5">
              <Brain size={9} /> S2 Passed {candidate.aptitude.evaluation.percentage}%
            </Badge>
          )}
          {candidate.aptitude?.status === "completed" && candidate.aptitude.evaluation && !candidate.aptitude.evaluation.passed && (
            <Badge className="bg-red-500/15 text-red-500 border-red-500/30 border text-[10px] px-1.5 py-0 h-4 gap-0.5">
              <Brain size={9} /> S2 Failed {candidate.aptitude.evaluation.percentage}%
            </Badge>
          )}
          {candidate.dsa?.status === "in_progress" && (
            <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/30 border text-[10px] px-1.5 py-0 h-4 gap-0.5">
              <BarChart3 size={9} /> DSA In Progress
            </Badge>
          )}
          {candidate.dsa?.status === "completed" && candidate.dsa.evaluation?.passed && (
            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 border text-[10px] px-1.5 py-0 h-4 gap-0.5">
              <BarChart3 size={9} /> S3 Passed {candidate.dsa.evaluation.passed_problems}/3
            </Badge>
          )}
          {candidate.dsa?.status === "completed" && candidate.dsa.evaluation && !candidate.dsa.evaluation.passed && (
            <Badge className="bg-red-500/15 text-red-500 border-red-500/30 border text-[10px] px-1.5 py-0 h-4 gap-0.5">
              <BarChart3 size={9} /> S3 Failed {candidate.dsa.evaluation.passed_problems}/3
            </Badge>
          )}
          {candidate.meet_interview?.status === "in_progress" && (
            <Badge className="bg-violet-500/15 text-violet-600 border-violet-500/30 border text-[10px] px-1.5 py-0 h-4 gap-0.5">
              <Mic size={9} /> Interview In Progress
            </Badge>
          )}
          {candidate.meet_interview?.status === "completed" && candidate.meet_interview.evaluation?.passed && (
            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 border text-[10px] px-1.5 py-0 h-4 gap-0.5">
              <Video size={9} /> S4 Selected {candidate.meet_interview.evaluation.overall_score}%
            </Badge>
          )}
          {candidate.meet_interview?.status === "completed" && candidate.meet_interview.evaluation && !candidate.meet_interview.evaluation.passed && (
            <Badge className="bg-red-500/15 text-red-500 border-red-500/30 border text-[10px] px-1.5 py-0 h-4 gap-0.5">
              <Video size={9} /> S4 Not Selected {candidate.meet_interview.evaluation.overall_score}%
            </Badge>
          )}
          {candidate.meet_selection_email_sent && (
            <Badge className="bg-green-500/15 text-green-600 border-green-500/30 border text-[10px] px-1.5 py-0 h-4 gap-0.5">
              <Mail size={9} /> Offer Sent
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{candidate.email}</p>
        {candidate.screening_reason && (
          <p className="text-xs text-muted-foreground mt-1 italic">"{candidate.screening_reason}"</p>
        )}
        {candidate.assessment?.status === "completed" && candidate.assessment.evaluation && (
          <p className="text-xs text-muted-foreground mt-1">
            <span className="font-medium">Assessment:</span> {candidate.assessment.evaluation.overall_feedback}
            {(candidate.assessment.violations ?? 0) > 0 && (
              <span className="text-amber-500 ml-1">· {candidate.assessment.violations} violation(s)</span>
            )}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ── Job Detail View ───────────────────────────────────────────────────────────
function MeetReportSection({ job, candidates }: { job: Job; candidates: Candidate[] }) {
  const { toast } = useToast();
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

  const meetCandidates = candidates.filter((c) => c.meet_interview?.status === "completed");
  const selected = meetCandidates.filter((c) => c.meet_interview?.evaluation?.passed);
  const notSelected = meetCandidates.filter((c) => c.meet_interview?.evaluation && !c.meet_interview.evaluation.passed);
  const inProgress = candidates.filter((c) => c.meet_interview?.status === "in_progress");

  const handleSendSelectionEmail = async (candidate: Candidate) => {
    const user = auth.currentUser;
    if (!user) return;
    setSendingEmail(candidate.candidate_id);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`${FASTAPI_URL}/api/meet/send-selection-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: job.job_id,
          candidate_id: candidate.candidate_id,
          hr_token: idToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to send email");
      toast({
        title: "Selection email sent! 🎉",
        description: `Offer notification sent to ${candidate.email}`,
      });
    } catch (err: unknown) {
      toast({
        title: "Failed to send email",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSendingEmail(null);
    }
  };

  if (meetCandidates.length === 0 && inProgress.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
        <Video size={20} className="mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          No candidates have completed the AI voice interview yet. Candidates unlock this after passing DSA (Stage 3).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Completed", value: meetCandidates.length, color: "text-foreground" },
          { label: "Selected", value: selected.length, color: "text-green-600" },
          { label: "Not Selected", value: notSelected.length, color: "text-red-500" },
        ].map((s) => (
          <div key={s.label} className="bg-muted/40 rounded-xl p-3 text-center">
            <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* In-progress */}
      {inProgress.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-center gap-2">
          <Loader2 size={14} className="text-amber-500 animate-spin shrink-0" />
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {inProgress.length} candidate(s) currently taking the AI voice interview…
          </p>
        </div>
      )}

      {/* Selected — with Send Email button */}
      {selected.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Trophy size={14} className="text-green-500" />
            <p className="text-xs font-semibold text-green-700 dark:text-green-400">
              Selected Candidates ({selected.length})
            </p>
          </div>
          {selected.map((c) => (
            <div key={c.candidate_id} className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-xs font-bold text-green-600 shrink-0">
                    {c.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-green-600">{c.meet_interview?.evaluation?.overall_score}%</p>
                  <p className="text-[11px] text-muted-foreground">Overall Score</p>
                </div>
              </div>

              {/* Score breakdown */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-card rounded-lg p-2 text-center">
                  <p className="text-sm font-bold">{c.meet_interview?.evaluation?.hr_score}%</p>
                  <p className="text-[10px] text-muted-foreground">HR Score</p>
                </div>
                <div className="bg-card rounded-lg p-2 text-center">
                  <p className="text-sm font-bold">{c.meet_interview?.evaluation?.technical_score}%</p>
                  <p className="text-[10px] text-muted-foreground">Technical Score</p>
                </div>
              </div>

              {c.meet_interview?.evaluation?.summary && (
                <p className="text-xs text-muted-foreground italic">"{c.meet_interview.evaluation.summary}"</p>
              )}

              {/* Send Selection Email */}
              {c.meet_selection_email_sent ? (
                <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 size={13} className="shrink-0" />
                  Selection email already sent to candidate.
                </div>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handleSendSelectionEmail(c)}
                  disabled={sendingEmail === c.candidate_id}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:opacity-90 gap-2"
                >
                  {sendingEmail === c.candidate_id ? (
                    <><Loader2 size={13} className="animate-spin" /> Sending…</>
                  ) : (
                    <><Mail size={13} /> Send Selection Email</>
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Not Selected */}
      {notSelected.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <XCircle size={14} className="text-red-500" />
            <p className="text-xs font-semibold text-red-600 dark:text-red-400">
              Not Selected ({notSelected.length})
            </p>
          </div>
          {notSelected.map((c) => (
            <div key={c.candidate_id} className="flex items-center gap-3 rounded-xl border border-red-500/15 bg-red-500/5 p-3">
              <div className="w-7 h-7 rounded-full bg-red-500/20 flex items-center justify-center text-xs font-bold text-red-500 shrink-0">
                {c.name?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.email}</p>
              </div>
              <span className="text-sm font-bold text-red-500 shrink-0">
                {c.meet_interview?.evaluation?.overall_score}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JobDetailView({ job, onBack }: { job: Job; onBack: () => void }) {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [isRerunning, setIsRerunning] = useState(false);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    const candidatesRef = collection(db, "jobs", job.job_id, "candidates");
    const unsub = onSnapshot(candidatesRef, (snap) => {
      setCandidates(snap.docs.map((d) => d.data() as Candidate));
    });
    return () => unsub();
  }, [job.job_id]);

  const shortlisted = candidates.filter((c) => c.screening_result === "shortlisted");
  const rejected = candidates.filter((c) => c.screening_result === "rejected");
  const unscreened = candidates.filter((c) => !c.screening_result);

  const handleRerunScreening = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setIsRerunning(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`${FASTAPI_URL}/api/screening/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: job.job_id, hr_token: idToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Screening failed");
      toast({
        title: "Re-screening complete!",
        description: `${data.total_shortlisted} shortlisted · ${data.total_rejected} rejected`,
      });
    } catch (err: unknown) {
      toast({
        title: "Screening failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsRerunning(false);
    }
  };

  const handleResendEmails = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setIsResending(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`${FASTAPI_URL}/api/emails/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: job.job_id, hr_token: idToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Email sending failed");
      toast({
        title: "Emails sent!",
        description: `${data.sent} email(s) delivered · ${data.failed} failed · ${data.skipped} skipped`,
      });
    } catch (err: unknown) {
      toast({
        title: "Email agent failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  const isScreeningActive = job.screening_status === "pending" || job.screening_status === "running" || isRerunning;
  const isScreeningDone = job.screening_status === "done" && !isRerunning;

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 pb-20"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="shrink-0 mt-0.5"
          data-testid="button-back-to-list"
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold truncate">{job.job_title}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {job.hr_name} · {formatDate(job.created_at)} · {job.total_candidates} candidate(s)
          </p>
        </div>
        <ScreeningStatusBadge status={job.screening_status} />
      </div>

      {/* ── Stage 1: Screening Agent ─────────────────────────────────────── */}
      <div className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-card-border flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white text-xs font-bold shrink-0">
            1
          </div>
          <div>
            <p className="font-semibold">Screening Agent</p>
            <p className="text-xs text-muted-foreground">AI evaluates each resume against the job description</p>
          </div>
          <div className="ml-auto">
            {isScreeningActive && (
              <span className="inline-flex items-center gap-1.5 text-xs text-purple-500 font-medium animate-pulse">
                <Loader2 size={13} className="animate-spin" /> Auto-running…
              </span>
            )}
            {isScreeningDone && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRerunScreening}
                disabled={isRerunning}
                className="gap-1.5 text-muted-foreground"
                data-testid="button-rerun-screening"
              >
                {isRerunning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Re-run
              </Button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Status Banner */}
          <AnimatePresence mode="wait">
            {isScreeningActive && (
              <AgentWorkingBanner key="working" />
            )}
            {isScreeningDone && (
              <ScreeningDoneBanner
                key="done"
                shortlisted={shortlisted.length}
                rejected={rejected.length}
              />
            )}
            {candidates.length === 0 && !isScreeningActive && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center"
              >
                <Users size={20} className="mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No candidates found for this job.</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Candidate Lists after screening */}
          {isScreeningDone && (
            <div className="space-y-5">
              {shortlisted.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 size={16} className="text-green-500" />
                    <p className="font-semibold text-sm text-green-700 dark:text-green-400">
                      Shortlisted Candidates ({shortlisted.length})
                    </p>
                  </div>
                  <div className="space-y-2">
                    {shortlisted.map((c) => (
                      <CandidateCard key={c.candidate_id} candidate={c} />
                    ))}
                  </div>
                </div>
              )}

              {rejected.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <XCircle size={16} className="text-red-500" />
                    <p className="font-semibold text-sm text-red-600 dark:text-red-400">
                      Rejected Candidates ({rejected.length})
                    </p>
                  </div>
                  <div className="space-y-2">
                    {rejected.map((c) => (
                      <CandidateCard key={c.candidate_id} candidate={c} />
                    ))}
                  </div>
                </div>
              )}

              {unscreened.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Clock size={16} className="text-muted-foreground" />
                    <p className="font-semibold text-sm text-muted-foreground">
                      Awaiting Screening ({unscreened.length})
                    </p>
                  </div>
                  <div className="space-y-2">
                    {unscreened.map((c) => (
                      <CandidateCard key={c.candidate_id} candidate={c} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Stage 2: Email Agent ─────────────────────────────────────────── */}
      <div className={cn(
        "bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden transition-opacity duration-300",
        !isScreeningDone && "opacity-40 pointer-events-none"
      )}>
        <div className="px-6 py-4 border-b border-card-border flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white text-xs font-bold shrink-0">
            2
          </div>
          <div>
            <p className="font-semibold">Email Agent</p>
            <p className="text-xs text-muted-foreground">
              Auto-sends personalized emails after screening — congratulations to shortlisted, kind rejection to others
            </p>
          </div>
          <div className="ml-auto">
            {isScreeningDone && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleResendEmails}
                disabled={isResending}
                className="gap-1.5 text-muted-foreground"
                data-testid="button-resend-emails"
              >
                {isResending ? (
                  <><Loader2 size={13} className="animate-spin" /> Sending…</>
                ) : (
                  <><Send size={13} /> Re-send</>
                )}
              </Button>
            )}
          </div>
        </div>

        <div className="p-6">
          {job.emails_sent ? (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 flex items-center gap-3"
            >
              <Mail size={18} className="text-blue-500 shrink-0" />
              <div>
                <p className="font-medium text-sm text-blue-700 dark:text-blue-400">Emails delivered automatically</p>
                <p className="text-xs text-blue-600/70 dark:text-blue-500/70 mt-0.5">
                  All candidates have been notified of their screening outcome. Use Re-send if you need to resend.
                </p>
              </div>
            </motion.div>
          ) : isScreeningDone ? (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-dashed border-amber-400/40 bg-amber-500/5 p-5 flex items-start gap-3"
            >
              <Mail size={18} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">SMTP not configured</p>
                <p className="text-xs text-amber-600/70 dark:text-amber-500/70 mt-0.5">
                  Add <code className="font-mono bg-amber-500/10 px-1 rounded">SMTP_USER</code> and{" "}
                  <code className="font-mono bg-amber-500/10 px-1 rounded">SMTP_PASSWORD</code> in your backend <code className="font-mono bg-amber-500/10 px-1 rounded">.env</code> to enable auto email delivery.
                  Then use "Re-send" above to trigger manually.
                </p>
              </div>
            </motion.div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
              <Mail size={20} className="mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Emails will auto-send once screening completes.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Stage 4: Meet Agent (AI Voice Interview) ─────────────────────── */}
      <div className={cn(
        "bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden transition-opacity duration-300",
        !isScreeningDone && "opacity-40 pointer-events-none"
      )}>
        <div className="px-6 py-4 border-b border-card-border flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            4
          </div>
          <div>
            <p className="font-semibold">Meet Agent — AI Voice Interview</p>
            <p className="text-xs text-muted-foreground">
              Candidates who pass DSA are invited for a 10-question voice interview (5 HR + 5 Technical).
              AI evaluates answers and recommends final selection.
            </p>
          </div>
          <div className="ml-auto">
            {candidates.filter((c) => c.meet_interview?.status === "completed" && c.meet_interview.evaluation?.passed).length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-green-600 font-medium bg-green-500/10 border border-green-500/20 px-2 py-1 rounded-lg">
                <Trophy size={12} />
                {candidates.filter((c) => c.meet_interview?.evaluation?.passed).length} selected
              </span>
            )}
          </div>
        </div>
        <div className="p-6">
          <MeetReportSection job={job} candidates={candidates} />
        </div>
      </div>
    </motion.div>
  );
}

// ── Job List Card ─────────────────────────────────────────────────────────────
function JobCard({ job, onClick }: { job: Job; onClick: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="w-full text-left bg-card border border-card-border rounded-2xl p-5 hover:border-primary/40 hover:shadow-md transition-all group"
      data-testid={`job-card-${job.job_id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate">{job.job_title}</p>
            <ScreeningStatusBadge status={job.screening_status} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Posted {formatDate(job.created_at)} · {job.hr_name}
          </p>
        </div>
        <ChevronRight
          size={18}
          className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0 mt-0.5"
        />
      </div>

      <div className="flex items-center gap-5 mt-4">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users size={14} />
          <span>{job.total_candidates} candidates</span>
        </div>
        {job.screening_status === "done" && (
          <>
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 size={14} />
              <span>{job.total_shortlisted ?? 0} shortlisted</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-red-500">
              <XCircle size={14} />
              <span>{job.total_rejected ?? 0} rejected</span>
            </div>
          </>
        )}
        {job.emails_sent && (
          <div className="flex items-center gap-1.5 text-sm text-blue-500">
            <Mail size={14} />
            <span>Notified</span>
          </div>
        )}
      </div>
    </motion.button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function InterviewManager() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  useEffect(() => {
    let unsubJobs: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      const jobsRef = collection(db, "jobs");
      // No orderBy here — avoids needing a composite Firestore index.
      // We sort client-side instead.
      const q = query(jobsRef, where("hr_uid", "==", user.uid));

      unsubJobs = onSnapshot(
        q,
        (snap) => {
          const jobList = snap.docs
            .map((d) => d.data() as Job)
            .sort((a, b) => {
              const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
              const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
              return tb - ta;
            });

          setJobs(jobList);

          setSelectedJob((prev) => {
            if (!prev) return prev;
            const updated = jobList.find((j) => j.job_id === prev.job_id);
            return updated ?? prev;
          });

          setLoading(false);
        },
        (err) => {
          console.error("[Firestore] Error fetching jobs:", err);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubJobs) unsubJobs();
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6 pb-20"
    >
      <AnimatePresence mode="wait">
        {selectedJob ? (
          <JobDetailView
            key={selectedJob.job_id}
            job={selectedJob}
            onBack={() => setSelectedJob(null)}
          />
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Interview Manager</h2>
                <p className="text-muted-foreground mt-1">View scheduled interviews and run AI screening</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-muted/50 border border-border px-3 py-1.5 rounded-lg">
                  <Briefcase size={14} />
                  <span>{jobs.length} job{jobs.length !== 1 ? "s" : ""}</span>
                </div>
              </div>
            </div>

            {/* Stats row */}
            {jobs.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Total Jobs", value: jobs.length, icon: Briefcase },
                  {
                    label: "Total Candidates",
                    value: jobs.reduce((s, j) => s + (j.total_candidates || 0), 0),
                    icon: Users,
                  },
                  {
                    label: "Shortlisted",
                    value: jobs.reduce((s, j) => s + (j.total_shortlisted || 0), 0),
                    icon: CheckCircle2,
                  },
                  {
                    label: "Screened Jobs",
                    value: jobs.filter((j) => j.screening_status === "done").length,
                    icon: Sparkles,
                  },
                ].map((stat, i) => {
                  const Icon = stat.icon;
                  return (
                    <div key={i} className="bg-card border border-card-border p-4 rounded-xl shadow-sm">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Icon size={14} />
                        <span className="text-xs font-medium">{stat.label}</span>
                      </div>
                      <p className="text-2xl font-bold">{stat.value}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Job Cards */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 size={28} className="animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading interviews…</p>
              </div>
            ) : jobs.length === 0 ? (
              <div className="bg-card border border-card-border rounded-2xl p-14 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
                  <CalendarPlus size={28} />
                </div>
                <h4 className="text-lg font-semibold mb-1">No interviews scheduled yet</h4>
                <p className="text-sm text-muted-foreground max-w-sm mb-6">
                  Go to the Interview Scheduler, fill in the job details, upload resumes and submit — they'll appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => (
                  <JobCard
                    key={job.job_id}
                    job={job}
                    onClick={() => setSelectedJob(job)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}