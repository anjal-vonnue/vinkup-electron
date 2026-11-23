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
