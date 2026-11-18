import type { ReviewDecision, ReviewStatus } from './tasks';

/**
 * Events pushed over `GET /api/events` (Server-Sent Events).
 *
 * The stream only ever carries events for the signed-in user: a trainee sees
 * their own reviews, a mentor sees submissions from their assigned trainees.
 * Clients should treat an event as a hint to reload the affected resource —
 * the REST response stays the source of truth.
 */

/** A mentor approved or sent back one of this trainee's submissions. */
export type TaskReviewedEvent = {
  type: 'task.reviewed';
  taskId: string;
  decision: ReviewDecision;
  /** The trainee's review state after this decision: 'approved' or 'rework'. */
  reviewStatus: ReviewStatus;
  /** Which attempt was reviewed (1 = first submission). */
  submissionNo: number;
  feedback: string;
  reviewedAt: string;
};

/** A trainee submitted (or resubmitted) a task; sent to their assigned mentor. */
export type TaskSubmittedEvent = {
  type: 'task.submitted';
  traineeId: string;
  taskId: string;
  /** The new attempt number (increments on every resubmit). */
  submissionCount: number;
  submittedAt: string;
};

export type RealtimeEvent = TaskReviewedEvent | TaskSubmittedEvent;
