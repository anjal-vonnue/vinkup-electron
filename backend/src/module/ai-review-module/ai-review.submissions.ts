import type { AdminTaskCode } from '@itp/types';
import { AdminService } from '../admin-module/admin.service';

const adminService = new AdminService();

export const MAX_CODE_CHARS = 40_000;

export type Submission = {
  taskId: string;
  title: string;
  instructionsMarkdown: string;
  code: string;
};
export type Loaded = Submission | { taskId: string; error: string };

// ASSUMPTION: TaskFile has `path` and `content` strings. If the names differ, change only the map line.
const toSubmission = (taskId: string, task: AdminTaskCode): Submission | null => {
  // Starter code means the trainee hasn't submitted anything of their own yet.
  if (task.isStarterCode || task.files.length === 0) return null;
  const code = task.files
    .map((file) => `// File: ${file.path}\n${file.content}`)
    .join('\n\n')
    .trim();
  if (!code) return null;
  const clipped =
    code.length > MAX_CODE_CHARS ? `${code.slice(0, MAX_CODE_CHARS)}\n[truncated]` : code;
  return {
    taskId,
    title: task.title,
    instructionsMarkdown: task.instructionsMarkdown,
    code: clipped,
  };
};

export async function loadSubmission(traineeId: string, taskId: string): Promise<Loaded> {
  try {
    const task = await adminService.getTaskCode(traineeId, taskId);
    return (
      toSubmission(taskId, task) ?? { taskId, error: 'No submitted code found for this task.' }
    );
  } catch (error) {
    return {
      taskId,
      error: error instanceof Error ? error.message : 'Could not load the submitted code.',
    };
  }
}
