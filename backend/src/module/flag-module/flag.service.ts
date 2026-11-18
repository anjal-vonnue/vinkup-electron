import { flag_event_type } from '../../generated/prisma/enums.js';
import type { LogFlagType } from './flag.schema.js';
import { FlagRepository } from './flag.repository.js';
import { NotFoundError } from '../../errors/AppError.js';
import { review_priority } from '../../generated/prisma/enums.js';
import { ProgressService } from '../progress-module/progress.service.js';
const progressService = new ProgressService();

const DUPLICATE_WINDOW_MS = 2000;

function getReviewPriority(type: flag_event_type, durationMs = 0) {
  switch (type) {
    case 'PASTE_BLOCKED':
      return review_priority.LOW;

    case 'TAB_SWITCH':
      if (durationMs < 5_000) {
        return review_priority.LOW;
      }

      if (durationMs < 30_000) {
        return review_priority.NORMAL;
      }

      return review_priority.HIGH;

    case 'FULLSCREEN_EXIT':
      if (durationMs < 5_000) {
        return review_priority.LOW;
      }

      if (durationMs < 30_000) {
        return review_priority.NORMAL;
      }

      return review_priority.HIGH;

    case 'WINDOW_BLUR':
      if (durationMs < 5_000) {
        return review_priority.LOW;
      }

      if (durationMs < 30_000) {
        return review_priority.NORMAL;
      }

      return review_priority.HIGH;
  }
}

export class FlagService {
  private readonly repository: FlagRepository;

  constructor(repository = new FlagRepository()) {
    this.repository = repository;
  }

  logFlag = async (input: LogFlagType, trainee_id: string, task_id: string) => {
    const placement = await this.repository.findTask(task_id);
    if (!placement) throw new NotFoundError('Task not found.');
    await progressService.assertDayUnlocked(trainee_id, placement.curriculum_day.id);
    const priority = getReviewPriority(input.type, input.durationMs);
    const now = new Date();
    const since = new Date(now.getTime() - DUPLICATE_WINDOW_MS);
    const duplicate = await this.repository.findRecentFlag(trainee_id, task_id, input.type, since);
    if (duplicate) return;
    await this.repository.createFlag({ ...input, taskId: task_id }, priority, trainee_id);
  };
}
