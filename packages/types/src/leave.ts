export const LeaveStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type LeaveStatus = (typeof LeaveStatus)[keyof typeof LeaveStatus];

export type LeaveDecision = Extract<LeaveStatus, 'APPROVED' | 'REJECTED'>;

/** Mirrors the `admin.role` values stored in the database. */
export type LeaveReviewerRole = 'MENTOR' | 'MANAGER';

export const LEAVE_SUBJECT_MAX_LENGTH = 200;
export const LEAVE_REASON_MAX_LENGTH = 2000;
export const LEAVE_FEEDBACK_MAX_LENGTH = 2000;

/** One append-only decision. A request can have a Mentor and a Manager review. */
export type LeaveReview = {
  id: string;
  reviewerId: string;
  reviewerName: string;
  reviewerRole: LeaveReviewerRole;
  decision: LeaveDecision;
  feedback: string | null;
  reviewedAt: string;
};

export type LeaveRequest = {
  id: string;
  traineeId: string;
  traineeName: string;
  assignedMentor: { id: string; name: string } | null;
  subject: string;
  reason: string;
  status: LeaveStatus;
  submittedAt: string;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewerRole: LeaveReviewerRole | null;
  feedback: string | null;
  reviewedAt: string | null;
  /** Full decision history, oldest first. The top-level review fields mirror the final decision. */
  reviews: LeaveReview[];
  createdAt: string;
  updatedAt: string;
};

export type CreateLeaveRequestInput = {
  subject: string;
  reason: string;
};

export type ReviewLeaveRequestInput = {
  decision: LeaveDecision;
  feedback?: string;
};
