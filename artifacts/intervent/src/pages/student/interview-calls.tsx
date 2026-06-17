import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { collectionGroup, query, where, onSnapshot, updateDoc, Timestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { motion, AnimatePresence } from "framer-motion";
import {
  PhoneIncoming, CheckCircle2, XCircle, Clock, CalendarCheck,
  Building2, Briefcase, X, Send, Loader2, Code2, Trophy, AlertCircle, Brain, BarChart3, Video, Mic
} from "lucide-react";
import { db, auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface AssessmentRecord {
  status: "in_progress" | "completed";
  evaluation?: {
    percentage: number;
    passed: boolean;
    total_score: number;
    max_score: number;
    overall_feedback: string;
  };
  started_at?: string;
  completed_at?: string;
  violations?: number;
}

interface AptitudeRecord {
  status: "in_progress" | "completed";
  evaluation?: {
    percentage: number;
    passed: boolean;
    correct_count: number;
    total: number;
    overall_feedback: string;
  };
  started_at?: string;
  completed_at?: string;
  violations?: number;
}

interface DSARecord {
  status: "in_progress" | "completed";
  evaluation?: {
    percentage: number;
    passed: boolean;
    passed_problems: number;
    total_score: number;
    max_score: number;
    overall_feedback: string;
  };
  started_at?: string;
  completed_at?: string;
  violations?: number;
}

interface MeetRecord {
  status: "in_progress" | "completed";
  evaluation?: {
    overall_score: number;
    hr_score: number;
    technical_score: number;
    recommendation: "selected" | "not_selected";
    passed: boolean;
    summary: string;
  };
  started_at?: string;
  completed_at?: string;
}

interface CandidateRecord {
  candidate_id: string;
  job_id: string;
  job_title?: string;
  hr_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  screening_result?: "shortlisted" | "rejected" | "";
  screening_reason?: string;
  email_sent?: boolean;
  interview_preference?: { date: string; time: string; submitted_at: string };
  assessment?: AssessmentRecord;
  aptitude?: AptitudeRecord;
  dsa?: DSARecord;
  meet_interview?: MeetRecord;
  _ref: ReturnType<typeof import("firebase/firestore").doc>;
}

function StatusBadge({ result }: { result: string | undefined }) {
  if (result === "shortlisted") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
        <CheckCircle2 size={12} /> Selected
      </span>
    );
  }
  if (result === "rejected") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
        <XCircle size={12} /> Not Selected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
      <Clock size={12} /> Under Review
    </span>
  );
}

function ScheduleModal({
  candidate,
  onClose,
}: {
  candidate: CandidateRecord;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const handleSubmit = async () => {
    if (!date || !time) {
      toast({ title: "Please pick a date and time.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updateDoc(candidate._ref, {
        interview_preference: {
          date,
          time,
          submitted_at: new Date().toISOString(),
        },
      });
      toast({
        title: "Interview preference saved!",
        description: `Your preferred slot ${date} at ${time} has been sent to the HR team.`,
      });
      onClose();
    } catch (e) {
      toast({
        title: "Could not save",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.95, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 12 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="bg-card border border-card-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-card-border">
          <div>
            <h3 className="font-semibold text-base">Schedule Interview</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{candidate.job_title}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground rounded-lg p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {candidate.interview_preference && (
            <div className="rounded-xl bg-green-500/8 border border-green-500/20 p-3 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
              <CheckCircle2 size={14} className="shrink-0" />
              Already submitted: {candidate.interview_preference.date} at {candidate.interview_preference.time}. You can update below.
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Preferred Date</label>
            <Input
              type="date"
              min={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Preferred Time</label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="h-11"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            This is your preference. The HR team will confirm the final slot.
          </p>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !date}
            className="flex-1 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90 gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {saving ? "Saving…" : "Submit Preference"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CallCard({
  record,
  index,
}: {
  record: CandidateRecord;
  index: number;
}) {
  const [showSchedule, setShowSchedule] = useState(false);
  const [, setLocation] = useLocation();
  const isShortlisted = record.screening_result === "shortlisted";
  const isRejected = record.screening_result === "rejected";
  const assessment = record.assessment;
  const assessmentDone = assessment?.status === "completed";
  const assessmentInProgress = assessment?.status === "in_progress";
  const assessmentPassed = assessmentDone && assessment?.evaluation?.passed;
  const assessmentFailed = assessmentDone && assessment?.evaluation && !assessment.evaluation.passed;
  const aptitude = record.aptitude;
  const aptitudeDone = aptitude?.status === "completed";
  const aptitudeInProgress = aptitude?.status === "in_progress";
  const aptitudePassed = aptitudeDone && aptitude?.evaluation?.passed;
  const aptitudeFailed = aptitudeDone && aptitude?.evaluation && !aptitude.evaluation.passed;
  const dsa = record.dsa;
  const dsaDone = dsa?.status === "completed";
  const dsaInProgress = dsa?.status === "in_progress";
  const dsaPassed = dsaDone && dsa?.evaluation?.passed;
  const dsaFailed = dsaDone && dsa?.evaluation && !dsa.evaluation.passed;
  const meet = record.meet_interview;
  const meetDone = meet?.status === "completed";
  const meetInProgress = meet?.status === "in_progress";
  const meetPassed = meetDone && meet?.evaluation?.passed;
  const meetFailed = meetDone && meet?.evaluation && !meet.evaluation.passed;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.07 }}
        className={cn(
          "bg-card border border-card-border rounded-2xl overflow-hidden transition-all",
          isShortlisted && "border-green-500/30 shadow-sm shadow-green-500/5"
        )}
      >
        {isShortlisted && (
          <div className="h-1 w-full bg-gradient-to-r from-[#667eea] to-[#764ba2]" />
        )}

        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className={cn(
                "w-11 h-11 rounded-xl flex items-center justify-center shrink-0",
                isShortlisted
                  ? "bg-gradient-to-br from-[#667eea]/20 to-[#764ba2]/20"
                  : "bg-muted"
              )}>
                <Briefcase size={20} className={isShortlisted ? "text-primary" : "text-muted-foreground"} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-base truncate">{record.job_title ?? "Job Opportunity"}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Building2 size={12} className="text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground truncate">{record.hr_name ?? "Company"}</span>
                </div>
              </div>
            </div>
            <StatusBadge result={record.screening_result} />
          </div>

          {record.screening_reason && (
            <div className={cn(
              "mt-4 rounded-xl p-3 text-xs leading-relaxed",
              isShortlisted
                ? "bg-green-500/5 border border-green-500/15 text-green-700 dark:text-green-400"
                : isRejected
                  ? "bg-red-500/5 border border-red-500/15 text-red-600 dark:text-red-400"
                  : "bg-muted text-muted-foreground"
            )}>
              <span className="font-semibold">AI Evaluation: </span>
              {record.screening_reason}
            </div>
          )}

          {isShortlisted && (
            <div className="mt-4 space-y-3">
              {record.interview_preference ? (
                <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CalendarCheck size={15} className="text-green-500 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-green-700 dark:text-green-400">
                        Slot submitted: {record.interview_preference.date} at {record.interview_preference.time}
                      </p>
                      <p className="text-[11px] text-muted-foreground">Awaiting HR confirmation</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowSchedule(true)}
                    className="shrink-0 text-xs gap-1"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setShowSchedule(true)}
                  className="w-full bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90 gap-2"
                  size="sm"
                >
                  <CalendarCheck size={15} />
                  Schedule Interview
                </Button>
              )}

              {/* ── Stage 1 Assessment section ── */}
              {record.interview_preference && (
                <>
                  {!assessment && (
                    <Button
                      onClick={() =>
                        setLocation(
                          `/student/assessment?job_id=${record.job_id}&candidate_id=${record.candidate_id}`
                        )
                      }
                      className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:opacity-90 gap-2"
                      size="sm"
                    >
                      <Code2 size={15} />
                      Take Stage 1 Assessment
                    </Button>
                  )}

                  {assessmentInProgress && (
                    <Button
                      onClick={() =>
                        setLocation(
                          `/student/assessment?job_id=${record.job_id}&candidate_id=${record.candidate_id}`
                        )
                      }
                      className="w-full gap-2 border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                      variant="outline"
                      size="sm"
                    >
                      <Loader2 size={14} className="animate-spin" />
                      Resume Assessment (In Progress)
                    </Button>
                  )}

                  {assessmentPassed && (
                    <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Trophy size={14} className="text-green-500 shrink-0" />
                          <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                            Stage 1 Passed — {assessment?.evaluation?.percentage}%
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setLocation(
                              `/student/assessment/results?job_id=${record.job_id}&candidate_id=${record.candidate_id}`
                            )
                          }
                          className="text-xs h-6 px-2"
                        >
                          View Results
                        </Button>
                      </div>
                    </div>
                  )}

                  {assessmentFailed && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle size={14} className="text-red-500 shrink-0" />
                        <p className="text-xs font-medium text-red-600 dark:text-red-400">
                          Stage 1 Not Passed — {assessment?.evaluation?.percentage}%
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setLocation(
                            `/student/assessment/results?job_id=${record.job_id}&candidate_id=${record.candidate_id}`
                          )
                        }
                        className="text-xs h-6 px-2"
                      >
                        View
                      </Button>
                    </div>
                  )}

                  {/* ── Stage 2 Aptitude section (only visible after Stage 1 passed) ── */}
                  {assessmentPassed && (
                    <>
                      {!aptitude && (
                        <Button
                          onClick={() =>
                            setLocation(
                              `/student/aptitude?job_id=${record.job_id}&candidate_id=${record.candidate_id}`
                            )
                          }
                          className="w-full bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90 gap-2"
                          size="sm"
                        >
                          <Brain size={15} />
                          Take Stage 2 Aptitude Test
                        </Button>
                      )}

                      {aptitudeInProgress && (
                        <Button
                          onClick={() =>
                            setLocation(
                              `/student/aptitude?job_id=${record.job_id}&candidate_id=${record.candidate_id}`
                            )
                          }
                          className="w-full gap-2 border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                          variant="outline"
                          size="sm"
                        >
                          <Loader2 size={14} className="animate-spin" />
                          Resume Aptitude Test (In Progress)
                        </Button>
                      )}

                      {aptitudePassed && (
                        <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Trophy size={14} className="text-green-500 shrink-0" />
                            <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                              Stage 2 Passed — {aptitude?.evaluation?.percentage}%
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setLocation(
                                `/student/aptitude/results?job_id=${record.job_id}&candidate_id=${record.candidate_id}`
                              )
                            }
                            className="text-xs h-6 px-2"
                          >
                            View Results
                          </Button>
                        </div>
                      )}

                      {aptitudeFailed && (
                        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <AlertCircle size={14} className="text-red-500 shrink-0" />
                            <p className="text-xs font-medium text-red-600 dark:text-red-400">
                              Stage 2 Not Passed — {aptitude?.evaluation?.percentage}%
                            </p>
                          </div>
                          <Button size="sm" variant="outline"
                            onClick={() => setLocation(`/student/aptitude/results?job_id=${record.job_id}&candidate_id=${record.candidate_id}`)}
                            className="text-xs h-6 px-2">
                            View
                          </Button>
                        </div>
                      )}

                      {/* ── Stage 3 DSA (only after Stage 2 passed) ── */}
                      {aptitudePassed && (
                        <>
                          {!dsa && (
                            <Button
                              onClick={() => setLocation(`/student/dsa?job_id=${record.job_id}&candidate_id=${record.candidate_id}`)}
                              className="w-full bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90 gap-2"
                              size="sm">
                              <BarChart3 size={15} />
                              Take Stage 3 DSA Coding Round
                            </Button>
                          )}
                          {dsaInProgress && (
                            <Button
                              onClick={() => setLocation(`/student/dsa?job_id=${record.job_id}&candidate_id=${record.candidate_id}`)}
                              className="w-full gap-2 border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                              variant="outline" size="sm">
                              <Loader2 size={14} className="animate-spin" />
                              Resume DSA Round (In Progress)
                            </Button>
                          )}
                          {dsaPassed && (
                            <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Trophy size={14} className="text-green-500 shrink-0" />
                                <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                                  Stage 3 Passed — {dsa?.evaluation?.passed_problems}/3 solved
                                </p>
                              </div>
                              <Button size="sm" variant="outline"
                                onClick={() => setLocation(`/student/dsa/results?job_id=${record.job_id}&candidate_id=${record.candidate_id}`)}
                                className="text-xs h-6 px-2">
                                View Results
                              </Button>
                            </div>
                          )}
                          {dsaFailed && (
                            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <AlertCircle size={14} className="text-red-500 shrink-0" />
                                <p className="text-xs font-medium text-red-600 dark:text-red-400">
                                  Stage 3 Not Passed — {dsa?.evaluation?.passed_problems}/3 solved
                                </p>
                              </div>
                              <Button size="sm" variant="outline"
                                onClick={() => setLocation(`/student/dsa/results?job_id=${record.job_id}&candidate_id=${record.candidate_id}`)}
                                className="text-xs h-6 px-2">
                                View
                              </Button>
                            </div>
                          )}

                          {/* ── Stage 4 AI Voice Interview (only after Stage 3 passed) ── */}
                          {dsaPassed && (
                            <>
                              {!meet && (
                                <Button
                                  onClick={() => setLocation(`/student/meet?job_id=${record.job_id}&candidate_id=${record.candidate_id}`)}
                                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:opacity-90 gap-2"
                                  size="sm"
                                >
                                  <Video size={15} />
                                  Take Stage 4 AI Voice Interview
                                </Button>
                              )}
                              {meetInProgress && (
                                <Button
                                  onClick={() => setLocation(`/student/meet?job_id=${record.job_id}&candidate_id=${record.candidate_id}`)}
                                  className="w-full gap-2 border-amber-500/40 text-amber-600 hover:bg-amber-500/10"
                                  variant="outline"
                                  size="sm"
                                >
                                  <Loader2 size={14} className="animate-spin" />
                                  Resume AI Interview (In Progress)
                                </Button>
                              )}
                              {meetPassed && (
                                <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Trophy size={14} className="text-green-500 shrink-0" />
                                    <div>
                                      <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                                        Stage 4 Passed — {meet?.evaluation?.overall_score}% score
                                      </p>
                                      <p className="text-[11px] text-green-600/70 dark:text-green-500/70">
                                        Recommended for Selection ✓
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {meetFailed && (
                                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-2">
                                  <AlertCircle size={14} className="text-red-500 shrink-0" />
                                  <div>
                                    <p className="text-xs font-medium text-red-600 dark:text-red-400">
                                      Stage 4 Not Passed — {meet?.evaluation?.overall_score}% score
                                    </p>
                                    <p className="text-[11px] text-red-500/70">Below threshold for this round</p>
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {showSchedule && (
          <ScheduleModal candidate={record} onClose={() => setShowSchedule(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

export default function InterviewCalls() {
  const [records, setRecords] = useState<CandidateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const authUnsub = onAuthStateChanged(auth, (user) => {
      if (!user?.email) {
        setLoading(false);
        return;
      }
      setUserEmail(user.email);

      const emailLower = user.email.toLowerCase();
      const emailCapFirst =
        emailLower.charAt(0).toUpperCase() + emailLower.slice(1);

      // Merge results from both queries into a deduped map keyed by candidate doc id.
      // This handles existing data where the LLM may have stored a mixed-case email
      // (e.g. "Adhityan@gmail.com") as well as correctly normalised lowercase emails.
      const resultMap = new Map<string, CandidateRecord>();

      const processSnap = async (
        snap: import("firebase/firestore").QuerySnapshot,
        resolve: () => void
      ) => {
        for (const d of snap.docs) {
          if (resultMap.has(d.id)) continue; // already processed
          const data = d.data();
          const jobId = d.ref.parent.parent?.id ?? "";

          let jobTitle = data.job_role || data.job_title || "";
          let hrName = data.hr_name || "";

          if (!jobTitle || !hrName) {
            try {
              const jobRef = d.ref.parent.parent;
              if (jobRef) {
                const { getDoc } = await import("firebase/firestore");
                const jobSnap = await getDoc(jobRef);
                if (jobSnap.exists()) {
                  const jd = jobSnap.data();
                  jobTitle = jobTitle || jd.job_title || "";
                  hrName = hrName || jd.hr_name || "";
                }
              }
            } catch {}
          }

          resultMap.set(d.id, {
            candidate_id: d.id,
            job_id: jobId,
            job_title: jobTitle,
            hr_name: hrName,
            full_name: data.full_name,
            email: data.email,
            phone: data.phone,
            screening_result: data.screening_result,
            screening_reason: data.screening_reason,
            email_sent: data.email_sent,
            interview_preference: data.interview_preference,
            assessment: data.assessment,
            aptitude: data.aptitude,
            dsa: data.dsa,
            _ref: d.ref,
          });
        }

        const items = Array.from(resultMap.values());
        items.sort((a, b) => {
          const order = { shortlisted: 0, "": 1, rejected: 2 };
          return (
            (order[a.screening_result ?? ""] ?? 1) -
            (order[b.screening_result ?? ""] ?? 1)
          );
        });

        setRecords(items);
        resolve();
      };

      let resolveLoading: () => void;
      const loadingDone = new Promise<void>((r) => (resolveLoading = r));
      loadingDone.then(() => setLoading(false));

      // Query 1: lowercase email (new uploads after backend fix)
      const q1 = query(
        collectionGroup(db, "candidates"),
        where("email", "==", emailLower)
      );
      // Query 2: first-letter-capitalised email (existing data extracted by LLM)
      const q2 = query(
        collectionGroup(db, "candidates"),
        where("email", "==", emailCapFirst)
      );

      let q1Ready = false;
      let q2Ready = false;
      const checkBothReady = () => {
        if (q1Ready && q2Ready) resolveLoading!();
      };

      const unsub1 = onSnapshot(q1, async (snap) => {
        await processSnap(snap, () => {
          if (!q1Ready) { q1Ready = true; checkBothReady(); }
        });
      });

      const unsub2 = onSnapshot(q2, async (snap) => {
        await processSnap(snap, () => {
          if (!q2Ready) { q2Ready = true; checkBothReady(); }
        });
      });

      return () => {
        unsub1();
        unsub2();
      };
    });
    return () => authUnsub();
  }, []);

  const shortlisted = records.filter((r) => r.screening_result === "shortlisted");
  const underReview = records.filter((r) => !r.screening_result);
  const rejected = records.filter((r) => r.screening_result === "rejected");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Interview Calls</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Your application status across all jobs you applied for.
        </p>
      </div>

      {userEmail && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border border-card-border rounded-xl px-4 py-2.5 w-fit">
          <span>Matched by email:</span>
          <span className="font-medium text-foreground">{userEmail}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-36 bg-card border border-card-border rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl border border-dashed border-border bg-muted/30 p-12 text-center"
        >
          <PhoneIncoming size={36} className="mx-auto text-muted-foreground mb-3" />
          <p className="font-medium text-muted-foreground">No interview calls yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Your status will appear here once an HR team reviews your resume.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-8">
          {shortlisted.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={16} className="text-green-500" />
                <h3 className="font-semibold text-sm text-green-700 dark:text-green-400">
                  Selected — Congratulations! ({shortlisted.length})
                </h3>
              </div>
              <div className="space-y-3">
                {shortlisted.map((r, i) => <CallCard key={`${r.job_id}-${r.candidate_id}`} record={r} index={i} />)}
              </div>
            </div>
          )}

          {underReview.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock size={16} className="text-amber-500" />
                <h3 className="font-semibold text-sm text-amber-600 dark:text-amber-400">
                  Under Review ({underReview.length})
                </h3>
              </div>
              <div className="space-y-3">
                {underReview.map((r, i) => <CallCard key={`${r.job_id}-${r.candidate_id}`} record={r} index={i} />)}
              </div>
            </div>
          )}

          {rejected.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <XCircle size={16} className="text-red-500" />
                <h3 className="font-semibold text-sm text-red-600 dark:text-red-400">
                  Not Selected ({rejected.length})
                </h3>
              </div>
              <div className="space-y-3">
                {rejected.map((r, i) => <CallCard key={`${r.job_id}-${r.candidate_id}`} record={r} index={i} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
