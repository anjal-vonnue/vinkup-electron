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
  /** The task's title, so a notification can name it without another request. */
  taskTitle: string;
  decision: ReviewDecision;
  /** The trainee's review state after this decision: 'approved' or 'rework'. */
  reviewStatus: ReviewStatus;
  /** Which attempt was reviewed (1 = first submission). */
  submissionNo: number;
  feedback: string;
  /** The mentor who made the decision. */
  mentorName: string;
  reviewedAt: string;
};

/** A trainee submitted (or resubmitted) a task; sent to their assigned mentor. */
export type TaskSubmittedEvent = {
  type: 'task.submitted';
  traineeId: string;
  /** The trainee's name, so a notification can say who submitted. */
  traineeName: string;
  taskId: string;
  /** The task's title, so a notification can name it without another request. */
  taskTitle: string;
  /** The new attempt number (increments on every resubmit). */
  submissionCount: number;
  submittedAt: string;
};

/**
 * A trainee first saved a task, moving it from "not started" to "In progress".
 * Sent to their assigned mentor; later saves for the same task are not pushed.
 */
export type TaskStartedEvent = {
  type: 'task.started';
  traineeId: string;
  taskId: string;
  startedAt: string;
};

/** A trainee triggered an integrity flag (tab switch, blocked paste, …); sent to their mentor. */
export type FlagCreatedEvent = {
  type: 'flag.created';
  traineeId: string;
  taskId: string;
  flagId: string;
  timestamp: string;
};

/**
 * A manager moved a trainee to a different mentor (or unassigned them).
 * Sent to the previous and the new mentor, so both admin views update without a reload.
 */
export type TraineeReassignedEvent = {
  type: 'trainee.reassigned';
  traineeId: string;
  traineeName: string;
  /** The mentor who lost access, or null when the trainee was unassigned before. */
  previousMentorId: string | null;
  /** The mentor who gained access, or null when the trainee is now unassigned. */
  mentorId: string | null;
  changedAt: string;
};

/**
 * A trainee submitted a leave request; sent to their assigned mentor so the
 * Leave requests badge can tick up without a reload.
 */
export type LeaveSubmittedEvent = {
  type: 'leave.submitted';
  traineeId: string;
  traineeName: string;
  requestId: string;
  subject: string;
};

/**
 * A mentor or manager approved or rejected a leave request; sent to the
 * trainee so the Leave badge can tick up without a reload. Manager overrides
 * re-fire this, because `reviewed_at` moves and the trainee should re-badge.
 */
export type LeaveReviewedEvent = {
  type: 'leave.reviewed';
  traineeId: string;
  requestId: string;
  decision: 'APPROVED' | 'REJECTED';
};

export type RealtimeEvent =
  | TaskReviewedEvent
  | TaskSubmittedEvent
  | TaskStartedEvent
  | FlagCreatedEvent
  | TraineeReassignedEvent
  | LeaveSubmittedEvent
  | LeaveReviewedEvent;
