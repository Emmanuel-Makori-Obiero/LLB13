export type Unit = {
  id: string;
  name: string;
  code: string;
  lead: string;
  representatives?: string[] | null;
  progress: number;
  next: string;
  color: string;
};
export type Material = {
  id: string;
  title: string;
  author?: string | null;
  type: string;
  unit: string;
  topic: string;
  date: string;
  source: string;
  url?: string;
  storage_path?: string;
  owner_id?: string | null;
  file_sha256?: string | null;
  target_years?: string[] | null;
  archive_path?: string | null;
  exam_year?: number | null;
  exam_session?: string | null;
  course_code?: string | null;
  paper_variant?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  ingestion_status?: "queued" | "extracting" | "indexing" | "embedding" | "ready" | "failed" | string | null;
  ingestion_error?: string | null;
  metadata_confidence?: number | null;
};
export type AssignmentStatus =
  | "Not Started"
  | "In Progress"
  | "Submitted"
  | "Under Review"
  | "Corrections"
  | "Completed";
export type Assignment = {
  id: string;
  title: string;
  unit: string;
  due: string;
  status: AssignmentStatus;
  owner: string;
  reviewer: string;
  brief: string;
  target_years?: string[] | null;
};
export type Discussion = {
  id: string;
  title: string;
  day: string;
  time: string;
  leader: string;
  status: string;
  prep: string;
  topics: string[];
  instant?: boolean;
  created_by?: string | null;
};
export type Member = {
  name: string;
  initials: string;
  role: string;
  units: string;
  user_id?: string | null;
  progress: number;
  tone: string;
  section?: "A" | "B";
};
export type Todo = {
  id: string;
  title: string;
  completed: boolean;
  due?: string;
  assignment_id?: string;
  source?: "manual" | "assignment";
};
export type MediaResource = {
  id: string;
  kind: "movie" | "youtube" | "music" | "court";
  title: string;
  url: string;
  topic: string;
  source: string;
  is_public?: boolean;
};
export type AdminAccount = {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
  is_primary_admin: boolean;
};

export type StudyGroup = {
  id: string;
  name: string;
  leader_id: string;
  created_at: string;
};

export type StudyGroupMember = {
  group_id: string;
  user_id: string;
  display_name: string;
  joined_at: string;
};

export type GroupSession = {
  id: string;
  group_id: string;
  kind: "daily" | "project";
  title: string;
  project_label: string | null;
  session_date: string;
  check_in_cutoff: string | null;
  status: "open" | "closed";
  created_by: string | null;
  created_at: string;
};

export type GroupAttendanceStatus = "present" | "late" | "excused" | "absent";

export type GroupAttendance = {
  session_id: string;
  user_id: string;
  status: GroupAttendanceStatus;
  note: string | null;
  marked_by: string | null;
  marked_at: string;
};

export type GroupAttendanceSummary = {
  group_id: string;
  group_name?: string;
  user_id: string;
  display_name: string;
  sessions_held: number;
  present: number;
  late: number;
  excused: number;
  absent: number;
  attendance_percentage: number;
  last_active_date: string | null;
};

export type ApprovedGroupLeader = {
  user_id: string;
  email: string;
  display_name: string;
  created_at: string;
};

export type SavedExamAnalysis = {
  id: string;
  paper_title: string;
  source_document_id: string | null;
  student_answers: string;
  analysis: string;
  created_at: string;
};

export type ExamAnalysisDraft = Omit<SavedExamAnalysis, "created_at">;

export type Lesson = {
  id: string;
  unit: string;
  topic: string;
  lesson_date: string;
  start_time?: string | null;
  end_time?: string | null;
  representative?: string | null;
  representatives?: string[] | null;
  venue?: string | null;
  created_by?: string | null;
};

export type TimetableProposal = {
  id: string;
  title: string;
  instruction: string;
  source_filename?: string | null;
  status: "pending" | "approved" | "rejected" | "reverted";
  proposed_lessons: Omit<Lesson, "id" | "created_by">[];
  rationale: string;
  created_by?: string | null;
  created_at: string;
  approved_at?: string | null;
};

export type SharedTimetableUpload = {
  id: string;
  filename: string;
  mime_type?: string | null;
  extracted_text?: string;
  structured_rows: Omit<Lesson, "id" | "created_by">[];
  created_by?: string | null;
  created_at: string;
};

// Representatives of a unit. Falls back to the old single `lead` value for units saved before multi-rep support.
export const unitReps = (
  unit?: Pick<Unit, "lead" | "representatives"> | null,
): string[] => {
  if (!unit) return [];
  if (unit.representatives?.length) return unit.representatives;
  return unit.lead && unit.lead !== "To be assigned" ? [unit.lead] : [];
};

// Representatives of a lesson. Falls back to the old single `representative` value.
export const lessonReps = (
  lesson: Pick<Lesson, "representative" | "representatives">,
): string[] => {
  if (lesson.representatives?.length) return lesson.representatives;
  return lesson.representative ? [lesson.representative] : [];
};

export type ClubPoster = {
  id: string;
  title: string;
  image_url: string;
  storage_path: string;
  link_url: string | null;
  ai_analysis: string;
  created_at: string;
};
