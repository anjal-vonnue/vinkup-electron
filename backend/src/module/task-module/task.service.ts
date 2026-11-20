import type { SubmitTaskResponse, TaskCodeResponse, TaskFile, TaskResponse } from '@itp/types';
import { ConflictError, NotFoundError } from '../../errors/AppError';
import { ProgressService } from '../progress-module/progress.service';
import { toTaskFiles } from './task.files';
import { TaskRepository } from './task.repository';
import { realtimeBroker } from '../realtime-module/realtime.broker';
import { publishToMentor } from '../realtime-module/realtime.notify';

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

  /**
   * Returns the trainee's working files.
   * Before the first save, returns the task's starter files.
   */
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

    return {
      files: toTaskFiles(task.starter_files),
      updatedAt: null,
    };
  }

  /**
   * Saves the trainee's working copy.
   *
   * IMPORTANT:
   * This must only update `files`.
   * It must never modify `submitted_files` or submission metadata.
   */
  async saveCode(traineeId: string, taskId: string, files: TaskFile[]): Promise<void> {
    await progressService.assertTaskUnlocked(traineeId, taskId);

    const previous = await taskRepository.findProgressStatus(traineeId, taskId);
    const savedAt = new Date();
    await taskRepository.saveFiles(traineeId, taskId, files, savedAt);

    // The first save is what turns the task into "In progress" for the mentor.
    if (!previous) {
      await publishToMentor(traineeId, {
        type: 'task.started',
        traineeId,
        taskId,
        startedAt: savedAt.toISOString(),
      });
    }
  }

  /**
   * Submits the current working copy for mentor review.
   *
   * Every submission creates a new submission attempt by:
   * - Copying files into submitted_files.
   * - Incrementing submission_count.
   * - Updating submission timestamps.
   * - Resetting review_status to pending.
   *
   * The repository must perform these updates atomically.
   *
   * Editing remains unlocked after submission.
   * Approved tasks cannot be resubmitted.
   */
  async submit(traineeId: string, taskId: string): Promise<SubmitTaskResponse> {
    await progressService.assertTaskUnlocked(traineeId, taskId);

    const now = new Date();

    // Repository must snapshot the current working files into submitted_files.
    const row = await taskRepository.markSubmitted(traineeId, taskId, now);

    if (!row) {
      throw new ConflictError(
        'ALREADY_APPROVED',
        'This task was approved, so it cannot be resubmitted.'
      );
    }

    const submittedAt = (row.last_submitted_at ?? now).toISOString();

    const context = await taskRepository.findSubmissionContext(traineeId, taskId);

    // Notify only the assigned mentor.
    if (context.mentorId) {
      realtimeBroker.publish(context.mentorId, {
        type: 'task.submitted',
        traineeId,
        traineeName: context.traineeName,
        taskId,
        taskTitle: context.taskTitle,
        submissionCount: row.submission_count,
        submittedAt,
      });
    }

    return {
      status: 'completed',
      submittedAt,
      reviewStatus: 'pending',
      submissionCount: row.submission_count,
    };
  }
}
