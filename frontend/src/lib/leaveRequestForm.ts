import { LEAVE_REASON_MAX_LENGTH, LEAVE_SUBJECT_MAX_LENGTH } from '@itp/types';

export type LeaveFormErrors = { subject?: string; reason?: string };

/** Mirrors the backend Zod schema so simple mistakes never make a request. */
export function validateLeaveRequestForm(subject: string, reason: string): LeaveFormErrors {
  const errors: LeaveFormErrors = {};
  const trimmedSubject = subject.trim();
  const trimmedReason = reason.trim();

  if (trimmedSubject.length === 0) errors.subject = 'Enter a subject for your leave request.';
  else if (trimmedSubject.length > LEAVE_SUBJECT_MAX_LENGTH) {
    errors.subject = `Keep the subject under ${LEAVE_SUBJECT_MAX_LENGTH} characters.`;
  }

  if (trimmedReason.length === 0) errors.reason = 'Explain why you need leave.';
  else if (trimmedReason.length > LEAVE_REASON_MAX_LENGTH) {
    errors.reason = `Keep the reason under ${LEAVE_REASON_MAX_LENGTH} characters.`;
  }

  return errors;
}

export function hasLeaveFormErrors(errors: LeaveFormErrors): boolean {
  return Boolean(errors.subject ?? errors.reason);
}
