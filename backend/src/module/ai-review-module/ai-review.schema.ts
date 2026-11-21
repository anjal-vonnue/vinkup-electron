import { z } from 'zod';

export const MAX_PROMPT_NAME_CHARS = 100;
export const MAX_PROMPT_CONTENT_CHARS = 8000;

const nameSchema = z.string().trim().min(1).max(MAX_PROMPT_NAME_CHARS);
const contentSchema = z.string().trim().min(1).max(MAX_PROMPT_CONTENT_CHARS);

export const promptIdParamsSchema = z.object({ promptId: z.uuid() });

export const createPromptSchema = z.object({ name: nameSchema, content: contentSchema });

export const updatePromptSchema = z
  .object({ name: nameSchema.optional(), content: contentSchema.optional() })
  .refine((v) => v.name !== undefined || v.content !== undefined, {
    message: 'Provide a name or content to update.',
  });

export type CreatePromptBody = z.infer<typeof createPromptSchema>;
export type UpdatePromptBody = z.infer<typeof updatePromptSchema>;
