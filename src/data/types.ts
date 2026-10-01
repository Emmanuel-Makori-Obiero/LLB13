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
  type: string;
  unit: string;
  topic: string;
  date: string;
  source: string;
  url?: string;
  storage_path?: string;
  owner_id?: string | null;
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
};
export type AdminAccount = {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  last_sign_in_at: string | null;
};

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
