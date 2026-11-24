import { z } from 'zod';

/** Same rules as the frontend (frontend/src/lib/saveRules.ts), which checks them before saving. */
export const MAX_FILES_PER_TASK = 200;
export const MAX_FILE_CHARS = 200_000;
export const MAX_PATH_CHARS = 200;

/** Half of a surrogate pair (a broken emoji). */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** NUL, or half of a surrogate pair: Postgres can't store either in a jsonb column. */
function isStorable(text: string): boolean {
  return !text.includes('\u0000') && !LONE_SURROGATE.test(text);
}

/** Task ids are slugs built from the day id: "css-day-03-t-2". */
export const taskIdParamsSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
});

export type TaskIdParams = z.infer<typeof taskIdParamsSchema>;

const filePathSchema = z
  .string()
  .min(1)
  .max(MAX_PATH_CHARS)
  .refine((path) => !path.includes('\\'), 'Use / to separate folders.')
  .refine(
    (path) => path.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
    'Use a relative path with no empty, "." or ".." folders.'
  )
  .refine(isStorable, 'The path contains characters that cannot be saved.');

export const saveCodeBodySchema = z.object({
  files: z
    .array(
      z.object({
        path: filePathSchema,
        content: z
          .string()
          .max(MAX_FILE_CHARS)
          .refine(isStorable, 'The file contains characters that cannot be saved.'),
      })
    )
    .max(MAX_FILES_PER_TASK)
    .refine(
      (files) => new Set(files.map((file) => file.path)).size === files.length,
      'Two files have the same path.'
    ),
});

export const recordTimeBodySchema = z.object({
  deltaSeconds: z.number().int().min(0).max(3600),
});
