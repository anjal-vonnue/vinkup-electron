import { prisma } from '../../lib/prisma.js';

// Day content, completion counts and day completion used by the day routes.
// The unlock rule lives in ProgressService.isDayUnlocked(), not here.
export const dayAccessRepository = {
  /** Day lesson content in the order shown to trainees. */
  findDayContent(dayId: string) {
    return prisma.curriculum_day.findUnique({
      where: { id: dayId },
      select: {
        id: true,
        day_number: true,
        title: true,
        subtitle: true,
        lesson_summary: true,
        journal_prompt: true,
        course: { select: { id: true, title: true, _count: { select: { days: true } } } },
        learning_objectives: {
          orderBy: { sort_order: 'asc' },
          select: { id: true, code: true, title: true, description: true },
        },
        self_check_items: {
          orderBy: { sort_order: 'asc' },
          select: { id: true, code: true, label: true, description: true, is_required: true },
        },
      },
    });
  },

  /** Count of required tasks and this trainee's completed required tasks. */
  async getCompletionCounts(traineeId: string, dayId: string) {
    const requiredTasks = await prisma.task.count({
      where: { curriculum_day_id: dayId, is_stretch_goal: false },
    });
    const completedTasks = await prisma.task_progress.count({
      where: {
        trainee_id: traineeId,
        status: 'completed',
        task: { curriculum_day_id: dayId, is_stretch_goal: false },
      },
    });
    return { requiredTasks, completedTasks };
  },

  /** Idempotently records completion and finds the next day in curriculum order. */
  async completeDay(traineeId: string, dayId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.day_completion.upsert({
        where: {
          trainee_id_curriculum_day_id: { trainee_id: traineeId, curriculum_day_id: dayId },
        },
        create: { trainee_id: traineeId, curriculum_day_id: dayId },
        update: {},
      });

      const currentDay = await tx.curriculum_day.findUniqueOrThrow({
        where: { id: dayId },
        select: { day_number: true, course: { select: { sort_order: true } } },
      });
      const nextDay = await tx.curriculum_day.findFirst({
        where: {
          OR: [
            {
              course: { sort_order: currentDay.course.sort_order },
              day_number: { gt: currentDay.day_number },
            },
            { course: { sort_order: { gt: currentDay.course.sort_order } } },
          ],
        },
        orderBy: [{ course: { sort_order: 'asc' } }, { day_number: 'asc' }],
        select: { id: true },
      });
      return nextDay?.id ?? null;
    });
  },
};
