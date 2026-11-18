import type { task_progress } from '../../generated/prisma/client.js';
import { NotFoundError, DayLockedError } from '../../errors/AppError.js';
import { ProgressRepository } from './progress.repository.js';

const progressRepository = new ProgressRepository();

export type DayStatus = 'COMPLETED' | 'UNLOCKED' | 'LOCKED';

export interface DayProgress {
  dayId: string;
  status: DayStatus;
}

export class ProgressService {
  /**
   * THE day-lock rule. This is the only place it is defined; the day module
   * and every status calculation go through it.
   *
   * A day is unlocked when it is already completed, when it is the very first
   * day of the curriculum, or when the day before it is completed.
   *
   * @param orderedDayIds every curriculum day id in curriculum order
   *                      (course sort_order, then day_number)
   * @param completedDayIds ids of the days the trainee has completed
   * @returns false for a day id that is not in the curriculum
   */
  isDayUnlocked(
    orderedDayIds: readonly string[],
    completedDayIds: ReadonlySet<string>,
    dayId: string
  ): boolean {
    const index = orderedDayIds.indexOf(dayId);

    if (index === -1) {
      return false;
    }

    if (completedDayIds.has(dayId)) {
      return true;
    }

    if (index === 0) {
      return true;
    }

    return completedDayIds.has(orderedDayIds[index - 1]);
  }

  /**
   * Returns the status of every curriculum day for a trainee.
   * Uses two bulk queries, regardless of the number of days.
   */
  async getDayStatuses(traineeId: string): Promise<DayProgress[]> {
    const [days, completions] = await Promise.all([
      progressRepository.getCurriculumDays(),
      progressRepository.getDayCompletions(traineeId),
    ]);

    const orderedDayIds = days.map((day) => day.id);
    const completedDayIds = new Set(completions.map((completion) => completion.curriculum_day_id));

    return days.map<DayProgress>((day) => {
      if (completedDayIds.has(day.id)) {
        return { dayId: day.id, status: 'COMPLETED' };
      }

      if (this.isDayUnlocked(orderedDayIds, completedDayIds, day.id)) {
        return { dayId: day.id, status: 'UNLOCKED' };
      }

      return { dayId: day.id, status: 'LOCKED' };
    });
  }

  /**
   * Returns the status of one day.
   * Throws 404 if the day does not exist.
   */
  async getDayStatus(traineeId: string, dayId: string): Promise<DayStatus> {
    const statuses = await this.getDayStatuses(traineeId);
    const dayStatus = statuses.find((day) => day.dayId === dayId);

    if (!dayStatus) {
      throw new NotFoundError('Day not found.');
    }

    return dayStatus.status;
  }

  /**
   * Ensures that a day is accessible to the trainee.
   * Throws 404 for an unknown day and 403 for a locked day.
   */
  async assertDayUnlocked(traineeId: string, dayId: string): Promise<void> {
    const status = await this.getDayStatus(traineeId, dayId);

    if (status === 'LOCKED') {
      throw new DayLockedError();
    }
  }

  /**
   * A task is accessible only when its parent day is accessible.
   * Throws 404 if the task does not exist.
   */
  async assertTaskUnlocked(traineeId: string, taskId: string): Promise<void> {
    const task = await progressRepository.getTaskById(taskId);

    if (!task) {
      throw new NotFoundError('Task not found.');
    }

    await this.assertDayUnlocked(traineeId, task.curriculum_day_id);
  }

  /**
   * Derives task status from the trainee's saved progress row.
   */
  taskStatus(progressRow: task_progress | null): 'completed' | 'in_progress' | 'not_started' {
    if (!progressRow) {
      return 'not_started';
    }

    if (progressRow.status === 'completed') {
      return 'completed';
    }

    if (progressRow.code_updated_at || progressRow.files !== null) {
      return 'in_progress';
    }

    return 'not_started';
  }
}
