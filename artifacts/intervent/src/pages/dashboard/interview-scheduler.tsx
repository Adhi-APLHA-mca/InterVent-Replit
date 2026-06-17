import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion } from "framer-motion";
import { FileText, UploadCloud, X, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/firebase";

const FASTAPI_URL = import.meta.env.VITE_FASTAPI_URL || "";

const schedulerSchema = z.object({
  jobTitle: z.string().min(2, { message: "Job title is required." }),
  jobDescription: z.string().min(10, { message: "Job description is required." }),
  department: z.string().optional(),
  experienceLevel: z.string().optional(),
  openings: z.coerce.number().min(1, { message: "At least 1 opening is required." }),
  deadline: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  dailySlots: z.coerce.number().optional(),
  duration: z.string().optional(),
  interviewMode: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

interface UploadResult {
  candidate_id: string;
  file: string;
  full_name: string;
  email: string;
  job_role: string;
  stored_postgres: boolean;
  stored_firebase: boolean;
}

export default function InterviewScheduler() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof schedulerSchema>>({
    resolver: zodResolver(schedulerSchema),
    defaultValues: {
      jobTitle: "",
      jobDescription: "",
      department: "",
      experienceLevel: "",
      openings: 1,
      deadline: "",
      startDate: "",
      endDate: "",
      dailySlots: 5,
      duration: "45 min",
      interviewMode: "Virtual",
      location: "",
      notes: "",
    },
  });

  const interviewMode = form.watch("interviewMode");

  const addFiles = (incoming: FileList | File[]) => {
    const pdfs = Array.from(incoming).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    const rejected = Array.from(incoming).filter((f) => !f.name.toLowerCase().endsWith(".pdf"));

    if (rejected.length > 0) {
      toast({
        title: "Invalid file type",
        description: `${rejected.map((f) => f.name).join(", ")} — only PDF files are accepted.`,
        variant: "destructive",
      });
    }

    setFiles((prev) => {
      const combined = [...prev, ...pdfs];
      if (combined.length > 10) {
        toast({
          title: "Limit reached",
          description: "You can upload a maximum of 10 resumes at once.",
          variant: "destructive",
        });
        return combined.slice(0, 10);
      }
      return combined;
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (values: z.infer<typeof schedulerSchema>) => {
    if (files.length === 0) {
      toast({
        title: "No resumes uploaded",
        description: "Please upload at least one PDF resume before scheduling.",
        variant: "destructive",
      });
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      toast({
        title: "Not authenticated",
        description: "Please log in again.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    setUploadResults([]);

    try {
      const idToken = await user.getIdToken();
      const hrName = user.displayName || user.email || "HR Manager";

      const formData = new FormData();
      formData.append("job_title", values.jobTitle);
      formData.append("job_description", values.jobDescription || "");
      formData.append("hr_token", idToken);
      formData.append("hr_name", hrName);
      files.forEach((file) => formData.append("files", file));

      const response = await fetch(`${FASTAPI_URL}/api/resumes/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(err.detail || `Server error: ${response.status}`);
      }

      const data = await response.json();

      setUploadResults(data.candidates || []);

      toast({
        title: "Resumes processed successfully!",
        description: `${data.total_processed} of ${data.total_uploaded} resume(s) parsed for "${values.jobTitle}".`,
      });

      if (data.total_errors > 0) {
        toast({
          title: `${data.total_errors} file(s) had errors`,
          description: data.errors?.map((e: { file: string; error: string }) => `${e.file}: ${e.error}`).join(" | "),
          variant: "destructive",
        });
      }

      form.reset();
      setFiles([]);

      // Redirect to Interview Manager after a short delay so the toast is visible
      setTimeout(() => {
        navigate("/dashboard/manager");
      }, 1500);

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unexpected error occurred.";
      toast({
        title: "Upload failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6 pb-20"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Interview Scheduler</h2>
          <p className="text-muted-foreground mt-1">Set up and schedule your recruitment pipeline</p>
        </div>
        <Button
          onClick={form.handleSubmit(onSubmit)}
          disabled={isSubmitting}
          className="bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90 shrink-0"
          data-testid="button-schedule-header"
        >
          {isSubmitting ? "Processing Resumes..." : "Schedule Interview"}
          {!isSubmitting && <ArrowRight size={16} className="ml-2" />}
        </Button>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 gap-6">

            {/* Card 1: Job Details */}
            <div className="bg-card border border-card-border p-6 rounded-2xl shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Job Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FormField
                  control={form.control}
                  name="jobTitle"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Job Title *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Senior Frontend Engineer" {...field} data-testid="input-job-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Engineering" {...field} data-testid="input-department" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="experienceLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Experience Level</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-experience">
                            <SelectValue placeholder="Select level" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Fresher">Fresher</SelectItem>
                          <SelectItem value="1-3 Years">1-3 Years</SelectItem>
                          <SelectItem value="3-5 Years">3-5 Years</SelectItem>
                          <SelectItem value="5+ Years">5+ Years</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="openings"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Number of Openings</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} data-testid="input-openings" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="jobDescription"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Job Description (JD) *</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter the complete job description, requirements, and responsibilities..."
                          className="min-h-[120px]"
                          {...field}
                          data-testid="input-job-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Card 2: Recruitment Timeline */}
            <div className="bg-card border border-card-border p-6 rounded-2xl shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Recruitment Timeline</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                <FormField
                  control={form.control}
                  name="deadline"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Application Deadline</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-deadline" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interview Start Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-start-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interview End Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-end-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dailySlots"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Daily Interview Slots</FormLabel>
                      <FormControl>
                        <Input type="number" min={1} {...field} data-testid="input-daily-slots" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="duration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interview Duration</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-duration">
                            <SelectValue placeholder="Select duration" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="30 min">30 min</SelectItem>
                          <SelectItem value="45 min">45 min</SelectItem>
                          <SelectItem value="60 min">60 min</SelectItem>
                          <SelectItem value="90 min">90 min</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Card 3: Resume Upload */}
            <div className="bg-card border border-card-border p-6 rounded-2xl shadow-sm">
              <div className="mb-4">
                <h3 className="text-lg font-semibold">Upload Candidate Resumes</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload up to 10 PDF resumes — AI will automatically extract candidate profiles
                </p>
              </div>

              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors cursor-pointer",
                  isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50",
                  files.length > 0 ? "border-primary/40 bg-primary/5" : ""
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                data-testid="dropzone-resume-upload"
              >
                <input
                  type="file"
                  accept=".pdf"
                  multiple
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  data-testid="input-file-upload"
                />
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-3">
                  <UploadCloud size={24} />
                </div>
                <p className="font-medium mb-1">Drag & drop PDF resumes here</p>
                <p className="text-sm text-muted-foreground mb-2">or click to browse</p>
                <p className="text-xs text-muted-foreground">Accepted: PDF only · Max 10 resumes · Each up to 10MB</p>
              </div>

              {files.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{files.length} resume(s) selected</p>
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border"
                    >
                      <FileText size={18} className="text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(index);
                        }}
                        data-testid={`button-remove-file-${index}`}
                      >
                        <X size={16} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Card 4: Additional Settings */}
            <div className="bg-card border border-card-border p-6 rounded-2xl shadow-sm">
              <h3 className="text-lg font-semibold mb-4">Additional Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FormField
                  control={form.control}
                  name="interviewMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Interview Mode</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-interview-mode">
                            <SelectValue placeholder="Select mode" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="In-Person">In-Person</SelectItem>
                          <SelectItem value="Virtual">Virtual</SelectItem>
                          <SelectItem value="Hybrid">Hybrid</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{interviewMode === "In-Person" ? "Location" : "Meeting Link"}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={interviewMode === "In-Person" ? "Office Address" : "https://zoom.us/..."}
                          {...field}
                          data-testid="input-location"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Notes / Special Instructions</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Any specific instructions for interviewers or candidates..."
                          {...field}
                          data-testid="input-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Card 5: Upload Results (shown after processing) */}
            {uploadResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-card-border p-6 rounded-2xl shadow-sm"
              >
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle2 size={20} className="text-green-500" />
                  Candidates Extracted · Redirecting to Interview Manager…
                </h3>
                <div className="space-y-3">
                  {uploadResults.map((r) => (
                    <div
                      key={r.candidate_id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 text-xs font-bold mt-0.5">
                        {r.full_name?.charAt(0) || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{r.full_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{r.email} · {r.job_role}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">ID: {r.candidate_id}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {r.stored_postgres ? (
                          <span title="Saved to PostgreSQL" className="text-green-500"><CheckCircle2 size={14} /></span>
                        ) : (
                          <span title="PostgreSQL save failed" className="text-destructive"><AlertCircle size={14} /></span>
                        )}
                        {r.stored_firebase ? (
                          <span title="Synced to Firebase" className="text-blue-500"><CheckCircle2 size={14} /></span>
                        ) : (
                          <span title="Firebase sync failed" className="text-destructive"><AlertCircle size={14} /></span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 text-lg bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white hover:opacity-90"
            data-testid="button-schedule-submit"
          >
            {isSubmitting ? "Processing Resumes..." : "Schedule Interview & Process Resumes"}
            {!isSubmitting && <ArrowRight size={18} className="ml-2" />}
          </Button>
        </form>
      </Form>
    </motion.div>
  );
}
