import type { DayStatus } from './dashboard';
import type { FlagEventType } from './activity';
import type { ProfileData } from './profile';
import type { TaskFile, TaskStatus } from './tasks';

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
  files: TaskFile[];
  codeUpdatedAt: string | null;
  lastSubmittedAt: string | null;
};

/** POST /api/admin/trainees. The response is the new trainee's AdminTraineeSummary (201). */
export type CreateTraineeRequest = {
  name: string;
  email: string;
};

// ---------- Team analytics (GET /api/admin/analytics) ----------
// Every number comes from stored records. Dates are IST calendar days ("YYYY-MM-DD").

/** Query string of GET /api/admin/analytics. `from` and `to` are both included. */
export type AdminAnalyticsQuery = {
  from: string;
  to: string;
  traineeId?: string; // leave out for the whole team
};

/** Totals for the chosen period and trainee(s). */
export type AdminAnalyticsTotals = {
  daysCompleted: number; // curriculum days completed in the period
  tasksSubmitted: number; // tasks submitted for the first time in the period
  activeSeconds: number;
  codingSeconds: number;
  typingTests: number;
};

/** Team progress line: average curriculum days completed per trainee by the end of `date`. */
export type AdminAnalyticsProgressPoint = {
  date: string;
  averageDaysCompleted: number; // one decimal place
};

/** One trainee in the comparison chart. Always every trainee, so they can be compared. */
export type AdminAnalyticsTraineeRow = {
  traineeId: string;
  name: string;
  daysCompleted: number; // all time, like the trainee table
  totalDays: number;
  codingSeconds: number; // in the period
  activeSeconds: number; // in the period
};

/**
 * Task status right now. Only the current status is stored (no history), so the period
 * does not change these counts. There are no due dates or reviews, so no "overdue" or
 * "awaiting review".
 */
export type AdminAnalyticsTaskStatus = {
  completed: number;
  inProgress: number;
  notStarted: number;
};

/** Average WPM of the typing tests taken on `date`. Days with no test are left out. */
export type AdminAnalyticsTypingPoint = {
  date: string;
  averageWpm: number; // whole number
  traineesIncluded: number; // trainees who had taken at least one test by then
};

/**
 * Integrity score of the curriculum days completed on `date` (their average if more than one).
 * Days that are not completed yet have no date, so they are not in the trend.
 */
export type AdminAnalyticsIntegrityPoint = {
  date: string;
  averageScore: number; // 0-100, whole number
  daysScored: number;
};

/** GET /api/admin/analytics */
export type AdminAnalytics = {
  from: string;
  to: string;
  traineeId: string | null; // null = whole team
  traineeCount: number; // trainees the numbers cover (1 when one trainee is chosen)
  totals: AdminAnalyticsTotals;
  progressTrend: AdminAnalyticsProgressPoint[]; // one point for every day from `from` to `to`
  traineeComparison: AdminAnalyticsTraineeRow[]; // sorted by name
  taskStatus: AdminAnalyticsTaskStatus;
  typingTrend: AdminAnalyticsTypingPoint[]; // oldest first
  integrityTrend: AdminAnalyticsIntegrityPoint[]; // oldest first
};
