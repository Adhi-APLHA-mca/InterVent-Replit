import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { collection, onSnapshot, getDocs, query, where, limit } from "firebase/firestore";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { motion, AnimatePresence } from "framer-motion";
import {
  BriefcaseBusiness, Users, Calendar, Building2, Search,
  Upload, X, FileText, CheckCircle2, XCircle, Loader2, AlertCircle, Clock,
} from "lucide-react";
import { db, auth } from "@/lib/firebase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const FASTAPI_URL = import.meta.env.VITE_FASTAPI_URL || "";

interface Job {
  job_id: string;
  job_title: string;
  hr_name: string;
  job_description: string;
  total_candidates: number;
  screening_status: string;
  created_at: string;
  pooling_type?: "open" | "private";
  application_deadline?: string;
}

function formatDate(ts: string | undefined) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch {
    return ts;
  }
}

function isDeadlinePassed(deadline: string | undefined): boolean {
  if (!deadline) return false;
  try {
    const deadlineDate = new Date(deadline);
    // Give applicants the full deadline day — close at 23:59:59 that day
    deadlineDate.setHours(23, 59, 59, 999);
    return deadlineDate < new Date();
  } catch {
    return false;
  }
}

function ApplyModal({
  job,
  onClose,
  onApplied,
}: {
  job: Job;
  onClose: () => void;
  onApplied: (jobId: string) => void;
}) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [stage, setStage] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [result, setResult] = useState<{ name: string; message: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "PDF only", description: "Please upload a PDF resume.", variant: "destructive" });
      return;
    }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleSubmit = async () => {
    if (!file) {
      toast({ title: "Upload your resume first", variant: "destructive" });
      return;
    }
    setStage("submitting");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("You must be logged in to apply.");
      const token = await user.getIdToken();

      const formData = new FormData();
      formData.append("job_id", job.job_id);
      formData.append("student_token", token);
      formData.append("file", file);

      const res = await fetch(`${FASTAPI_URL}/api/jobs/apply`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({ detail: `Server error ${res.status}` }));
      if (!res.ok) {
        const detail = Array.isArray(data.detail)
          ? data.detail.map((e: { msg?: string }) => e.msg ?? JSON.stringify(e)).join(" · ")
          : data.detail || `Error ${res.status}`;
        throw new Error(detail);
      }

      setResult({ name: data.name, message: data.message });
      setStage("done");
      onApplied(job.job_id);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Unexpected error");
      setStage("error");
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
            <h3 className="font-semibold text-base">Apply for {job.job_title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{job.hr_name || "Company"}</p>
          </div>
          {stage !== "submitting" && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground rounded-lg p-1">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="p-6">
          {stage === "idle" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload your resume — our AI will parse it and screen your profile against the job description automatically.
              </p>

              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-colors cursor-pointer",
                  isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50",
                  file ? "border-green-500/40 bg-green-500/5" : ""
                )}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); e.target.value = ""; }}
                />
                {file ? (
                  <div className="flex items-center gap-3">
                    <FileText size={20} className="text-green-500 shrink-0" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB — click to change</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload size={24} className="text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">Drag & drop your resume here</p>
                    <p className="text-xs text-muted-foreground mt-1">PDF only · Max 10 MB</p>
                  </>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!file}
                  className="flex-1 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90"
                >
                  Submit Application
                </Button>
              </div>
            </div>
          )}

          {stage === "submitting" && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 size={28} className="text-primary animate-spin" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-base">Submitting your application…</p>
                <p className="text-sm text-muted-foreground mt-1">AI is parsing your resume and screening your profile</p>
              </div>
            </div>
          )}

          {stage === "done" && result && (
            <div className="flex flex-col items-center py-6 gap-4 text-center">
              <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-green-500" />
              </div>
              <div>
                <p className="font-semibold text-base">Application Submitted!</p>
                <p className="text-sm text-muted-foreground mt-1">{result.message}</p>
              </div>
              <Button
                onClick={() => setLocation("/student/calls")}
                className="w-full bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90"
              >
                View My Applications
              </Button>
            </div>
          )}

          {stage === "error" && (
            <div className="flex flex-col items-center py-6 gap-4 text-center">
              <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
                <XCircle size={28} className="text-red-500" />
              </div>
              <div>
                <p className="font-semibold text-base">Application Failed</p>
                <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
              </div>
              <div className="flex gap-3 w-full">
                <Button variant="outline" onClick={onClose} className="flex-1">Close</Button>
                <Button onClick={() => setStage("idle")} className="flex-1">Try Again</Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function JobCard({
  job,
  index,
  hasApplied,
  onApply,
}: {
  job: Job;
  index: number;
  hasApplied: boolean;
  onApply: (job: Job) => void;
}) {
  const isOpen = job.pooling_type === "open";
  const deadlinePassed = isOpen && isDeadlinePassed(job.application_deadline);
  const isHiring = isOpen && !deadlinePassed;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-card border border-card-border rounded-2xl p-5 hover:border-primary/40 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#667eea]/20 to-[#764ba2]/20 flex items-center justify-center shrink-0">
            <BriefcaseBusiness size={22} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base truncate">{job.job_title}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Building2 size={12} className="text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground truncate">{job.hr_name || "Company"}</span>
            </div>
          </div>
        </div>
        <span className={cn(
          "shrink-0 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full",
          hasApplied
            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
            : isHiring
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : "bg-muted text-muted-foreground"
        )}>
          {hasApplied ? "Applied" : isHiring ? "Hiring" : "Closed"}
        </span>
      </div>

      {job.job_description && (
        <p className="text-sm text-muted-foreground mt-3 line-clamp-2 leading-relaxed">
          {job.job_description}
        </p>
      )}

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-card-border gap-3 flex-wrap">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar size={12} />
            <span>Posted {formatDate(job.created_at)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users size={12} />
            <span>{job.total_candidates ?? 0} applicants</span>
          </div>
        </div>

        {job.application_deadline && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium",
            deadlinePassed ? "text-red-500" : "text-amber-600 dark:text-amber-400"
          )}>
            <Clock size={11} />
            <span>{deadlinePassed ? "Closed" : `Apply by ${formatDate(job.application_deadline)}`}</span>
          </div>
        )}
      </div>

      {hasApplied && (
        <div className="mt-3 flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-500/8 rounded-lg px-3 py-2">
          <CheckCircle2 size={13} className="shrink-0" />
          You have already applied for this position.
        </div>
      )}

      {!hasApplied && isHiring && (
        <Button
          onClick={() => onApply(job)}
          className="w-full mt-3 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90 gap-2"
          size="sm"
        >
          <Upload size={14} />
          Apply Now
        </Button>
      )}

      {!hasApplied && deadlinePassed && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          <AlertCircle size={13} className="shrink-0" />
          Applications for this position are closed.
        </div>
      )}
    </motion.div>
  );
}

export default function JobOpenings() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [applyingJob, setApplyingJob] = useState<Job | null>(null);
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [, setLocation] = useLocation();

  // Auth listener — redirect if not logged in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) { setLocation("/login"); return; }
      setCurrentUser(user);
    });
    return () => unsub();
  }, [setLocation]);

  // Live jobs feed — open pooling only
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "jobs"), (snap) => {
      const data = snap.docs
        .map((d) => ({ job_id: d.id, ...d.data() } as Job))
        .filter((j) => j.pooling_type === "open");
      data.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      setJobs(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Check which jobs this student has already applied to
  useEffect(() => {
    if (!currentUser?.email || jobs.length === 0) return;
    const email = currentUser.email.toLowerCase().trim();
    Promise.all(
      jobs.map(async (job) => {
        try {
          const snap = await getDocs(
            query(
              collection(db, "jobs", job.job_id, "candidates"),
              where("email", "==", email),
              limit(1)
            )
          );
          return snap.empty ? null : job.job_id;
        } catch {
          return null;
        }
      })
    ).then((results) => {
      setAppliedJobIds(new Set(results.filter(Boolean) as string[]));
    });
  }, [jobs, currentUser]);

  // Called immediately after a successful application
  const handleApplied = (jobId: string) => {
    setAppliedJobIds((prev) => new Set([...prev, jobId]));
    setApplyingJob(null);
  };

  const filtered = jobs.filter((j) =>
    j.job_title?.toLowerCase().includes(search.toLowerCase()) ||
    j.hr_name?.toLowerCase().includes(search.toLowerCase()) ||
    j.job_description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Job Openings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Browse open positions and apply directly — our AI will screen your resume instantly.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by title, company…"
          className="pl-9 h-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-44 bg-card border border-card-border rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl border border-dashed border-border bg-muted/30 p-12 text-center"
        >
          <BriefcaseBusiness size={36} className="mx-auto text-muted-foreground mb-3" />
          <p className="font-medium text-muted-foreground">
            {search ? "No jobs match your search." : "No open job positions at the moment."}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Check back soon — HR teams post new openings regularly!</p>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {filtered.map((job, i) => (
            <JobCard
              key={job.job_id}
              job={job}
              index={i}
              hasApplied={appliedJobIds.has(job.job_id)}
              onApply={(j) => setApplyingJob(j)}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {applyingJob && (
          <ApplyModal
            job={applyingJob}
            onClose={() => setApplyingJob(null)}
            onApplied={handleApplied}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
