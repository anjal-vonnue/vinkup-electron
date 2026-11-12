import type { SubmitTaskResponse, TaskCodeResponse, TaskFile, TaskResponse } from '@itp/types';
import { ConflictError, NotFoundError } from '../../errors/AppError';
import { ProgressService } from '../progress-module/progress.service';
import { toTaskFiles } from './task.files';
import { TaskRepository } from './task.repository';

const taskRepository = new TaskRepository();
const progressService = new ProgressService();

// Every method first checks the task exists (404) and its day is unlocked for this trainee (403).

export class TaskService {
  async getTask(traineeId: string, taskId: string): Promise<TaskResponse> {
    await progressService.assertTaskUnlocked(traineeId, taskId);

    const [task, progress] = await Promise.all([
      taskRepository.findTask(taskId),
      taskRepository.findProgress(traineeId, taskId),
    ]);
    if (!task) throw new NotFoundError('Task not found.');

    return {
      id: task.id,
      title: task.title,
      instructionsMarkdown: task.instructions_markdown,
      isStretchGoal: task.is_stretch_goal,
      sequenceOrder: task.sequence_order,
      estimatedMinutes: task.estimated_minutes,
      status: progressService.taskStatus(progress),
      reviewStatus: progress?.review_status ?? null,
      submissionCount: progress?.submission_count ?? 0,
      day: {
        id: task.curriculum_day.id,
        dayNumber: task.curriculum_day.day_number,
        courseTitle: task.curriculum_day.course.title,
      },
      runtime: task.runtime,
      runCommand: task.run_command,
      setupSql: task.setup_sql,
    };
  }

  /** The saved files, or the task's starter files with updatedAt null before the first save. */
  async getCode(traineeId: string, taskId: string): Promise<TaskCodeResponse> {
    await progressService.assertTaskUnlocked(traineeId, taskId);

    const progress = await taskRepository.findProgress(traineeId, taskId);
    if (progress && progress.files !== null) {
      return {
        files: toTaskFiles(progress.files),
        updatedAt: progress.code_updated_at?.toISOString() ?? null,
      };
    }

    const task = await taskRepository.findStarterFiles(taskId);
    if (!task) throw new NotFoundError('Task not found.');
    return { files: toTaskFiles(task.starter_files), updatedAt: null };
  }

  /** Replaces the whole file set: a file left out has been deleted. */
  async saveCode(traineeId: string, taskId: string, files: TaskFile[]): Promise<void> {
    await progressService.assertTaskUnlocked(traineeId, taskId);
    await taskRepository.saveFiles(traineeId, taskId, files, new Date());
  }

  /**
   * Can be repeated ("Resubmit"); it never locks editing and never completes the day.
   * Every submit becomes a new attempt: review_status returns to pending so the new
   * code waits for review again. An approved task cannot be resubmitted (409).
   */
  async submit(traineeId: string, taskId: string): Promise<SubmitTaskResponse> {
    await progressService.assertTaskUnlocked(traineeId, taskId);

    const now = new Date();
    const row = await taskRepository.markSubmitted(traineeId, taskId, now);
    if (!row) {
      throw new ConflictError(
        'ALREADY_APPROVED',
        'This task was approved, so it cannot be resubmitted.'
      );
    }

    return {
      status: 'completed',
      submittedAt: (row.last_submitted_at ?? now).toISOString(),
      reviewStatus: 'pending',
      submissionCount: row.submission_count,
    };
  }
}
