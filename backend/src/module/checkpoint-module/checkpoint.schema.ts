import { z } from 'zod';

const MAX_MARKDOWN_BYTES = 500_000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_WORKSPACE_FILES = 200;
const MAX_WORKSPACE_FILE_CHARS = 200_000;
const MAX_WORKSPACE_TOTAL_CHARS = 5_000_000;

const isoDate = z.string().trim().datetime({ offset: true, message: 'Use a valid date and time.' });

const markdown = z
  .string()
  .min(1, 'Upload or paste the Markdown question paper.')
  .max(MAX_MARKDOWN_BYTES, 'The Markdown file is too large.');

const workspacePath = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => {
    if (value.startsWith('/') || value.includes('\\') || value.includes('\0')) return false;
    return value
      .split('/')
      .every((segment) => segment !== '' && segment !== '.' && segment !== '..');
  }, 'Use a safe relative file path.');

const workspaceFiles = z
  .array(
    z.object({
      path: workspacePath,
      content: z.string().max(MAX_WORKSPACE_FILE_CHARS, 'A workspace file is too large.'),
    })
  )
  .max(MAX_WORKSPACE_FILES, 'Too many workspace files.')
  .refine(
    (files) =>
      files.reduce((total, file) => total + file.content.length, 0) <= MAX_WORKSPACE_TOTAL_CHARS,
    'The workspace files are too large.'
  );

const checkpointFields = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Enter a title.')
    .max(160, 'Keep the title under 160 characters.'),
  description: z.string().trim().max(5000),
  mode: z.enum(['MCQ', 'PRACTICAL']).optional(),
  durationMinutes: z.coerce.number().int().min(1).max(1440),
  totalMarks: z.coerce.number().int().min(1).max(10_000),
  passingMarks: z.coerce.number().int().min(1).max(10_000),
  startAt: isoDate.nullable().optional(),
  maxAttempts: z.coerce.number().int().min(1).max(20).optional(),
  allowEarlySubmission: z.boolean().optional(),
  allowLateEntry: z.boolean().optional(),
  resultVisibility: z.enum(['IMMEDIATE', 'AFTER_APPROVAL']).optional(),
  sourceFileName: z.string().trim().max(255).nullable().optional(),
  sourceMarkdown: markdown,
  traineeIds: z.array(z.string().uuid()).max(2000).optional(),
  groupIds: z.array(z.string().uuid()).max(500).optional(),
  practicalRuntime: z.enum(['browser', 'node', 'sql']).optional(),
  practicalRunCommand: z.string().trim().max(500).nullable().optional(),
  practicalSetupSql: z.string().max(MAX_MARKDOWN_BYTES).nullable().optional(),
  practicalStarterFiles: workspaceFiles.optional(),
});

export const createCheckpointSchema = checkpointFields
  .extend({ description: checkpointFields.shape.description.default('') })
  .refine((body) => body.passingMarks <= body.totalMarks, {
    message: 'Passing marks cannot be greater than total marks.',
    path: ['passingMarks'],
  });

export const updateCheckpointSchema = checkpointFields
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update.')
  .refine(
    (body) =>
      body.passingMarks === undefined ||
      body.totalMarks === undefined ||
      body.passingMarks <= body.totalMarks,
    { message: 'Passing marks cannot be greater than total marks.', path: ['passingMarks'] }
  );

export const checkpointIdParamsSchema = z.object({ checkpointId: z.string().uuid() });
export const attemptIdParamsSchema = z.object({ attemptId: z.string().uuid() });
export const questionParamsSchema = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
});
export const groupIdParamsSchema = z.object({ groupId: z.string().uuid() });

export const previewMarkdownSchema = z.object({ markdown });

export const saveAnswerSchema = z
  .object({
    clientRevision: z.coerce.number().int().min(0),
    answerText: z.string().max(MAX_MARKDOWN_BYTES).nullable().optional(),
    selectedOption: z.string().max(1000).nullable().optional(),
    file: z
      .object({
        name: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().min(1).max(200),
        size: z.coerce.number().int().min(1).max(MAX_FILE_BYTES),
        dataBase64: z
          .string()
          .min(1)
          .max(Math.ceil((MAX_FILE_BYTES * 4) / 3) + 16, 'The file is too large.'),
      })
      .nullable()
      .optional(),
    clearFile: z.boolean().optional(),
    files: workspaceFiles.nullable().optional(),
    clearFiles: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.answerText !== undefined ||
      body.selectedOption !== undefined ||
      body.file !== undefined ||
      body.clearFile === true ||
      body.files !== undefined ||
      body.clearFiles === true,
    'Provide an answer value.'
  );

export const gradeAttemptSchema = z.object({
  marks: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        awardedMarks: z.coerce.number().min(0),
      })
    )
    .max(500),
  feedback: z.string().trim().max(10_000).nullable().optional(),
});

export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter a group name.')
    .max(80, 'Keep the name under 80 characters.'),
  traineeIds: z.array(z.string().uuid()).max(2000).default([]),
});

export const updateGroupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  traineeIds: z.array(z.string().uuid()).max(2000).default([]),
});

export type CreateCheckpointBody = z.infer<typeof createCheckpointSchema>;
export type UpdateCheckpointBody = z.infer<typeof updateCheckpointSchema>;
export type SaveAnswerBody = z.infer<typeof saveAnswerSchema>;
export type GradeAttemptBody = z.infer<typeof gradeAttemptSchema>;
export type CreateGroupBody = z.infer<typeof createGroupSchema>;
export type UpdateGroupBody = z.infer<typeof updateGroupSchema>;
