import type { TypingSummaryResponse } from './typingTest';

export type NextDay = DaySummary & {
  courseTotalDays: number; // number of curriculum_day rows in this day's course
};

/** Seconds from activity_log. activeSeconds is all platform time and includes codingSeconds. */
export type TimeTotals = {
  activeSeconds: number;
  codingSeconds: number;
};

/** GET /api/dashboard */
export type DashboardResponse = {
  nextDay: NextDay | null; // computed by the backend; null = everything completed
  totalDaysCompleteOverall: number;
  totalDaysOverall: number;
  today: TimeTotals; // the activity_log row for today (Asia/Kolkata)
  total: TimeTotals; // sum of all activity_log rows
  typing: TypingSummaryResponse; // from typing_test_result; the trend covers the last 30 days
  completedCourseIds: string[];
};
export type DayStatus = 'LOCKED' | 'UNLOCKED' | 'COMPLETED';

export type DaySummary = {
  id: string;
  courseId: string;
  dayNumber: number;
  title: string;
  description: string; // curriculum_day.subtitle, shown on the current-lesson card
  status: DayStatus;
};

export type CertificateStatus = 'ACTIVE' | 'REVOKED';

export type CourseCertificate = {
  courseId: string;
  courseTitle: string;
  traineeName: string;
  daysCompleted: number;
  /** ISO. Earliest task_progress.created_at in this course; falls back to completedAt if none. */
  startedAt: string;
  /** ISO. Latest day_completion.completed_at in this course. */
  completedAt: string;
  /** ISO. When the certificate was issued. */
  issuedAt: string;
  /** Sum of every task's time_spent_seconds in this course (live, computed at read). */
  timeSpentSeconds: number;
  certificateId: string;
  status: CertificateStatus;
  signature: string;
  signatureAlgorithm: string;
  signatureVersion: string;
};

export type CertificateVerificationResponse = {
  valid: boolean;
  signatureValid: boolean;
  status: CertificateStatus | 'UNKNOWN';
  certificateId: string;
  traineeName: string | null;
  courseTitle: string | null;
  completedAt: string | null;
  issuedAt: string | null;
  message: string;
};
/** GET /api/courses/:courseId/days */
export type CourseDaysResponse = DaySummary[];

export type ReworkTaskSummary = {
  taskId: string;
  taskTitle: string;
  sequenceOrder: number;
  dayId: string;
  dayNumber: number;
  courseId: string;
  courseTitle: string;
  submissionCount: number;
  latestReview: {
    id: string;
    adminId: string;
    adminName: string;
    decision: 'rework';
    feedback: string;
    reviewedAt: string;
  } | null;
};
