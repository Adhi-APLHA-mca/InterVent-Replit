import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { motion } from "framer-motion";
import { BriefcaseBusiness, Users, Calendar, Building2, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { Input } from "@/components/ui/input";

interface Job {
  job_id: string;
  job_title: string;
  hr_name: string;
  job_description: string;
  total_candidates: number;
  screening_status: string;
  created_at: string;
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

function JobCard({ job, index }: { job: Job; index: number }) {
  const isHiring = job.screening_status !== "done";
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
        <span className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${
          isHiring
            ? "bg-green-500/10 text-green-600 dark:text-green-400"
            : "bg-muted text-muted-foreground"
        }`}>
          {isHiring ? "Hiring" : "Closed"}
        </span>
      </div>

      {job.job_description && (
        <p className="text-sm text-muted-foreground mt-3 line-clamp-2 leading-relaxed">
          {job.job_description}
        </p>
      )}

      <div className="flex items-center gap-5 mt-4 pt-4 border-t border-card-border">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar size={12} />
          <span>Posted {formatDate(job.created_at)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users size={12} />
          <span>{job.total_candidates ?? 0} applicants</span>
        </div>
      </div>
    </motion.div>
  );
}

export default function JobOpenings() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const q = query(collection(db, "jobs"));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ job_id: d.id, ...d.data() } as Job));
      data.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      setJobs(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

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
          Browse active positions — your resume may already be under review!
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
            <div key={i} className="h-32 bg-card border border-card-border rounded-2xl animate-pulse" />
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
            {search ? "No jobs match your search." : "No job openings at the moment."}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Check back soon!</p>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {filtered.map((job, i) => (
            <JobCard key={job.job_id} job={job} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
