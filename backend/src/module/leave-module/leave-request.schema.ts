import { z } from 'zod';
import {
  LEAVE_FEEDBACK_MAX_LENGTH,
  LEAVE_REASON_MAX_LENGTH,
  LEAVE_SUBJECT_MAX_LENGTH,
} from '@itp/types';

const subjectSchema = z
  .string()
  .trim()
  .min(1, 'Enter a subject for your leave request.')
  .max(LEAVE_SUBJECT_MAX_LENGTH, `Keep the subject under ${LEAVE_SUBJECT_MAX_LENGTH} characters.`);

const reasonSchema = z
  .string()
  .trim()
  .min(1, 'Explain why you need leave.')
  .max(LEAVE_REASON_MAX_LENGTH, `Keep the reason under ${LEAVE_REASON_MAX_LENGTH} characters.`);

const optionalFeedbackSchema = z
  .string()
  .trim()
  .max(LEAVE_FEEDBACK_MAX_LENGTH, `Keep feedback under ${LEAVE_FEEDBACK_MAX_LENGTH} characters.`);

export const createLeaveRequestSchema = z.object({
  subject: subjectSchema,
  reason: reasonSchema,
});

export const leaveRequestIdParamsSchema = z.object({
  requestId: z.string().uuid(),
});

/** A rejection must explain the decision; an approval may include a short note. */
export const reviewLeaveRequestSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('APPROVED'),
    feedback: optionalFeedbackSchema.optional(),
  }),
  z.object({
    decision: z.literal('REJECTED'),
    feedback: optionalFeedbackSchema.min(1, 'Add feedback before rejecting the request.'),
  }),
]);

export type CreateLeaveRequestBody = z.infer<typeof createLeaveRequestSchema>;
export type ReviewLeaveRequestBody = z.infer<typeof reviewLeaveRequestSchema>;
