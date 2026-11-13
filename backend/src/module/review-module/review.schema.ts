import { z } from 'zod';

/**
 * A review writes feedback for a trainee, so it is trimmed and length-capped here
 * once, before it ever reaches the database.
 */
export const MAX_FEEDBACK_CHARS = 5000;

const feedbackTextSchema = z
  .string()
  .trim()
  .min(1, 'Write some feedback first.')
  .max(MAX_FEEDBACK_CHARS, `Keep the feedback under ${MAX_FEEDBACK_CHARS} characters.`);

/** POST /api/admin/trainees/:traineeId/tasks/:taskId/rework — feedback is required. */
export const reworkFeedbackSchema = z.object({ feedback: feedbackTextSchema });

/**
 * POST /api/admin/trainees/:traineeId/tasks/:taskId/approve — an optional note.
 * An approval without a note stores an empty feedback string. The whole body may
 * be omitted ({ feedback: '' } is the parsed result), so Approve needs no form.
 */
export const approveNoteSchema = z
  .object({
    feedback: z
      .string()
      .trim()
      .max(MAX_FEEDBACK_CHARS, `Keep the note under ${MAX_FEEDBACK_CHARS} characters.`)
      .default(''),
  })
  .default({ feedback: '' });

export type ReworkFeedbackBody = z.infer<typeof reworkFeedbackSchema>;
export type ApproveNoteBody = z.infer<typeof approveNoteSchema>;
