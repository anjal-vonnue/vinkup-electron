import type { CompleteDayResponse, DayContent, DayCurrentStatus } from '@itp/types';
import { ChecklistIncompleteError, DayLockedError, NotFoundError } from '../../errors/AppError.js';
import { getDayAccessStatus } from './day-access.services.js';
import { dayAccessRepository } from './day-access.repository.js';

export const dayService = {
  async getDayContent(dayId: string): Promise<DayContent> {
    // Content stays readable for locked days so the course outline can show upcoming lessons.
    // Interactive day routes (tasks and journal) still enforce the unlock rule.
    const day = await dayAccessRepository.findDayContent(dayId);
    if (!day) throw new NotFoundError('Day not found');

    return {
      dayId: day.id,
      courseSlug: day.course.id,
      courseTitle: day.course.title,
      dayNumber: day.day_number,
      totalDays: day.course._count.days,
      title: day.title,
      subtitle: day.subtitle,
      lessonSummary: day.lesson_summary,
      learningObjectives: day.learning_objectives,
      selfCheckItems: day.self_check_items.map((item) => ({
        id: item.id,
        code: item.code,
        label: item.label,
        description: item.description,
        isRequired: item.is_required,
      })),
      journalPrompt: day.journal_prompt,
    };
  },

  getDayStatus(traineeId: string, dayId: string): Promise<DayCurrentStatus> {
    return getDayAccessStatus(traineeId, dayId);
  },

  async completeDay(traineeId: string, dayId: string): Promise<CompleteDayResponse> {
    const status = await getDayAccessStatus(traineeId, dayId);
    if (status.isLocked) throw new DayLockedError();

    if (!status.isCompleted) {
      const counts = await dayAccessRepository.getCompletionCounts(traineeId, dayId);
      if (counts.completedTasks < counts.requiredTasks) {
        throw new ChecklistIncompleteError(counts.completedTasks, counts.requiredTasks);
      }
    }

    const nextDayId = await dayAccessRepository.completeDay(traineeId, dayId);
    return { status: { isLocked: false, isCompleted: true }, nextDayId };
  },
};
