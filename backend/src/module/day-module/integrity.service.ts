import type { DayIntegrityResponse } from '@itp/types';
import { integrityRepository } from './integrity.repository';
import { DayLockedError } from '../../errors/AppError';
import { dayService } from './day.services';
import { buildDayIntegrity, isScoredFlag } from './integrity.scoring';

export const integrityService = {
  async getDayIntegrity(traineeId: string, dayId: string): Promise<DayIntegrityResponse> {
    // ASSUMPTION: reuse the same lookup that powers the day status endpoint
    // (returns { isLocked, isCompleted } and throws NotFoundError for an unknown day).
    const status = await dayService.getDayStatus(traineeId, dayId);
    if (status.isLocked) throw new DayLockedError();

    const [progressRows, allFlagRows] = await Promise.all([
      integrityRepository.findStartedTasks(traineeId, dayId),
      integrityRepository.findFlagEventsForDay(traineeId, dayId),
    ]);
    // Idle flags are never scored (see isScoredFlag).
    const flagRows = allFlagRows.filter(isScoredFlag);

    // A task counts as "worked on" if it has a progress row OR it has recorded flag events.
    // Submission is not required: flags on an unsubmitted task must still count.
    // The Set means a task that appears in both lists is counted once (no double counting).
    const startedTaskIds = [
      ...new Set([
        ...progressRows.map((row) => row.task_id),
        ...flagRows.map((row) => row.task_id),
      ]),
    ];

    return buildDayIntegrity({
      startedTaskIds,
      events: flagRows.map((row) => ({
        taskId: row.task_id,
        type: row.type,
        reviewPriority: row.review_priority,
        durationMs: row.duration_ms,
      })),
    });
  },
};
