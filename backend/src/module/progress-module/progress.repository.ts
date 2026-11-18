import { prisma } from '../../lib/prisma.js';

export class ProgressRepository {
  /**
   * Fetches all curriculum days in curriculum order.
   * Includes the course sort order so days can be ordered across courses.
   */
  getCurriculumDays = () => {
    return prisma.curriculum_day.findMany({
      include: {
        course: {
          select: {
            sort_order: true,
          },
        },
      },
      orderBy: [{ course: { sort_order: 'asc' } }, { day_number: 'asc' }],
    });
  };

  /**
   * Fetches only this trainee's day completions.
   * This is a bulk query; do not call it once per day.
   */
  getDayCompletions = (traineeId: string) => {
    return prisma.day_completion.findMany({
      where: { trainee_id: traineeId },
      select: {
        curriculum_day_id: true,
      },
    });
  };

  getDayById = (dayId: string) => {
    return prisma.curriculum_day.findUnique({
      where: { id: dayId },
      include: {
        course: {
          select: {
            sort_order: true,
          },
        },
      },
    });
  };

  getTaskById = (taskId: string) => {
    return prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        curriculum_day_id: true,
      },
    });
  };

  getTaskProgress = (traineeId: string, taskId: string) => {
    return prisma.task_progress.findUnique({
      where: {
        trainee_id_task_id: {
          trainee_id: traineeId,
          task_id: taskId,
        },
      },
    });
  };
}
