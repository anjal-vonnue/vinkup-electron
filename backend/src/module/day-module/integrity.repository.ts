import { prisma } from '../../lib/prisma.js';

export const integrityRepository = {
  /** Tasks of this day the trainee has worked on (a task_progress row that is not "not_started"). */
  findStartedTasks(traineeId: string, dayId: string) {
    return prisma.task_progress.findMany({
      where: {
        trainee_id: traineeId,
        status: { in: ['in_progress', 'completed'] },
        task: { curriculum_day_id: dayId }, // flag -> task -> day mapping lives here
      },
      select: { task_id: true },
    });
  },

  /**
   * ALL of this trainee's flag events for the tasks of this day, whether or not the task was submitted.
   * `context_data` is deliberately NOT selected (mentor-only).
   */
  findFlagEventsForDay(traineeId: string, dayId: string) {
    return prisma.flag_event.findMany({
      where: { trainee_id: traineeId, task: { curriculum_day_id: dayId } },
      select: { task_id: true, type: true, review_priority: true, duration_ms: true },
      orderBy: { timestamp: 'asc' },
    });
  },
};
