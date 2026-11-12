import type { DayStatus } from './dashboard';
import type { FlagEventType } from './activity';
import type { ProfileData } from './profile';
import type { ReviewStatus, TaskFile, TaskStatus } from './tasks';

export type TraineeIntegrityItem = {
  traineeId: string;
  score: number | null; // average of the trainee's day scores; null = nothing started yet, show "-"
  daysScored: number; // how many days the average is based on
};

/** GET /api/admin/trainees — one row per trainee */
export type AdminTraineeSummary = {
  id: string;
  name: string;
  email: string;
  daysCompleted: number;
  totalDays: number;
  currentDay: {
    id: string;
    courseTitle: string;
    dayNumber: number;
    title: string;
  } | null; // null = finished
  todayActiveSeconds: number;
  totalActiveSeconds: number;
  totalCodingSeconds: number;
  lastActiveDate: string | null; // "YYYY-MM-DD" (IST calendar day)
  latestWpm: number | null;
  flagsLast7Days: number;
  averageScore: number | null;
  daysScored: number;
};

export type AdminDay = {
  id: string;
  dayNumber: number;
  title: string;
  status: DayStatus;
  completedAt: string | null;
};

export type AdminTaskRow = {
  taskId: string;
  title: string;
  dayId: string;
  isStretchGoal: boolean;
  status: TaskStatus;
  /** Current review state: pending = waiting for a review, approved, rework. null = no review yet. */
  reviewStatus: ReviewStatus | null;
  /** Which submission attempt is current (1 = first submission). */
  submissionCount: number;
  codeUpdatedAt: string | null;
  lastSubmittedAt: string | null;
};

export type AdminJournalEntry = {
  dayId: string;
  courseTitle: string;
  dayNumber: number;
  dayTitle: string;
  responseText: string;
  updatedAt: string;
};

/** GET /api/admin/trainees/:traineeId */
export type AdminTraineeDetail = {
  id: string;
  profile: ProfileData; // same object the trainee's own profile page gets
  courses: { id: string; title: string; days: AdminDay[] }[];
  tasks: AdminTaskRow[];
  totalTasks: number;
  journal: AdminJournalEntry[];
};

/** GET /api/admin/trainees/:traineeId/flags — never served to trainees (FR-
18) */

export type AdminFlagEvent = {
  id: string;
  type: FlagEventType;
  taskId: string;
  taskTitle: string;
  dayId: string;
  durationMs: number | null;
  reviewPriority: 'LOW' | 'NORMAL' | 'HIGH';
  timestamp: string;
};

/** GET /api/admin/trainees/:traineeId/tasks/:taskId/code */
export type AdminTaskCode = {
  taskId: string;
  title: string;
  status: TaskStatus;
  isStarterCode: boolean; // true = never saved; files are the task's starter files
  reviewStatus: ReviewStatus | null;
  submissionCount: number;
  files: TaskFile[];
  codeUpdatedAt: string | null;
  lastSubmittedAt: string | null;
};

/** One feedback-bearing review for a trainee (feedback text is not empty). */
export type AdminFeedbackEntry = {
  id: string;
  taskId: string;
  taskTitle: string;
  dayId: string;
  adminId: string;
  adminName: string;
  /** The submission attempt this feedback was written for. */
  submissionNo: number;
  decision: 'approved' | 'rework';
  feedback: string;
  reviewedAt: string;
};

/** GET /api/admin/trainees/:traineeId/feedback — newest review first. */
export type AdminFeedbackListResponse = AdminFeedbackEntry[];

/** POST /api/admin/trainees. The response is the new trainee's AdminTraineeSummary (201). */
export type CreateTraineeRequest = {
  name: string;
  email: string;
};
