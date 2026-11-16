import { prisma } from '../../lib/prisma';

export const dayTasksRepository = {
  /** Query 1: every task of the day, already in order. */
  findTasksByDay(dayId: string) {
    return prisma.task.findMany({
      where: { curriculum_day_id: dayId },
      orderBy: { sequence_order: 'asc' },
      select: {
        id: true,
        title: true,
        sequence_order: true,
        is_stretch_goal: true,
      },
    });
  },

  /** Query 2: this trainee's progress rows for all tasks of the day (traineeId is in the where). */
  findProgressByDay(traineeId: string, dayId: string) {
    return prisma.task_progress.findMany({
      where: { trainee_id: traineeId, task: { curriculum_day_id: dayId } },
      select: { task_id: true, status: true, review_status: true },
    });
  },
};
