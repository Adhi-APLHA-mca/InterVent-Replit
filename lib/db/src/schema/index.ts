import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const candidatesTable = pgTable("candidates", {
  id: serial("id").primaryKey(),
  candidateId: text("candidate_id").notNull().unique(),
  jobId: text("job_id").notNull(),
  hrUid: text("hr_uid").notNull(),
  hrName: text("hr_name").notNull(),
  fullName: text("full_name"),
  email: text("email"),
  phone: text("phone"),
  skills: text("skills").array(),
  experience: numeric("experience", { precision: 4, scale: 1 }),
  education: text("education"),
  resumeText: text("resume_text"),
  resumePath: text("resume_path"),
  jobRole: text("job_role"),
  status: text("status").default("parsed"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCandidateSchema = createInsertSchema(candidatesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
export type Candidate = typeof candidatesTable.$inferSelect;
