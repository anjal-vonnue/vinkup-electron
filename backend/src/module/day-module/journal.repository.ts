import { prisma } from '../../lib/prisma.js';

// Model and field names follow the existing snake_case schema.prisma.
export const journalRepository = {
  /** All curriculum days with this trainee's saved response and completion date. */
  findEntries(traineeId: string) {
    return prisma.curriculum_day.findMany({
      orderBy: [{ course: { sort_order: 'asc' } }, { day_number: 'asc' }],
      select: {
        id: true,
        day_number: true,
        title: true,
        journal_prompt: true,
        course: { select: { id: true } },
        completions: {
          where: { trainee_id: traineeId },
          select: { completed_at: true },
          take: 1,
        },
        journal_responses: {
          where: { trainee_id: traineeId },
          select: { response_text: true, updated_at: true },
          take: 1,
        },
      },
    });
  },

  /** The day plus where it sits in the curriculum (course order, then day number). */

  findEntry(traineeId: string, dayId: string) {
    return prisma.journal_response.findUnique({
      where: {
        trainee_id_curriculum_day_id: { trainee_id: traineeId, curriculum_day_id: dayId },
      },
    });
  },

  // One row per trainee per day (@@unique), so save = create the first time, update after that.
  upsertEntry(traineeId: string, dayId: string, responseText: string) {
    return prisma.journal_response.upsert({
      where: {
        trainee_id_curriculum_day_id: { trainee_id: traineeId, curriculum_day_id: dayId },
      },
      create: { trainee_id: traineeId, curriculum_day_id: dayId, response_text: responseText },
      update: { response_text: responseText },
    });
  },
};
