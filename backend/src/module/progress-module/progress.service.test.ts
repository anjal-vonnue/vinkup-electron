import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError, DayLockedError } from '../../errors/AppError.js';

const { mockGetCurriculumDays, mockGetDayCompletions, mockGetTaskById } = vi.hoisted(() => ({
  mockGetCurriculumDays: vi.fn(),
  mockGetDayCompletions: vi.fn(),
  mockGetTaskById: vi.fn(),
}));

vi.mock('./progress.repository', () => ({
  ProgressRepository: class {
    getCurriculumDays = mockGetCurriculumDays;
    getDayCompletions = mockGetDayCompletions;
    getTaskById = mockGetTaskById;
  },
}));

import { ProgressService } from './progress.service.js';

describe('ProgressService', () => {
  let service: ProgressService;

  const traineeId = 'trainee-1';

  const days = [{ id: 'day-1' }, { id: 'day-2' }, { id: 'day-3' }];

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProgressService();

    mockGetCurriculumDays.mockResolvedValue(days);
    mockGetDayCompletions.mockResolvedValue([]);
    mockGetTaskById.mockResolvedValue({
      id: 'task-1',
      curriculum_day_id: 'day-1',
    });
  });

  describe('isDayUnlocked', () => {
    const ordered = ['day-1', 'day-2', 'day-3'];
    const done = (...ids: string[]) => new Set(ids);

    it('unlocks the first day with no progress', () => {
      expect(service.isDayUnlocked(ordered, done(), 'day-1')).toBe(true);
    });

    it('locks a day whose previous day is not completed', () => {
      expect(service.isDayUnlocked(ordered, done(), 'day-2')).toBe(false);
    });

    it('unlocks a day once the previous day is completed', () => {
      expect(service.isDayUnlocked(ordered, done('day-1'), 'day-2')).toBe(true);
      expect(service.isDayUnlocked(ordered, done('day-1'), 'day-3')).toBe(false);
    });

    it('keeps a completed day unlocked even if its previous day is not completed', () => {
      expect(service.isDayUnlocked(ordered, done('day-3'), 'day-3')).toBe(true);
    });

    it('returns false for a day that is not in the curriculum', () => {
      expect(service.isDayUnlocked(ordered, done('day-1'), 'unknown')).toBe(false);
    });
  });

  describe('getDayStatuses', () => {
    it('unlocks only the first day for a new trainee', async () => {
      await expect(service.getDayStatuses(traineeId)).resolves.toEqual([
        { dayId: 'day-1', status: 'UNLOCKED' },
        { dayId: 'day-2', status: 'LOCKED' },
        { dayId: 'day-3', status: 'LOCKED' },
      ]);
    });

    it('unlocks the first incomplete day after completed days', async () => {
      mockGetDayCompletions.mockResolvedValue([
        { curriculum_day_id: 'day-1' },
        { curriculum_day_id: 'day-2' },
      ]);

      await expect(service.getDayStatuses(traineeId)).resolves.toEqual([
        { dayId: 'day-1', status: 'COMPLETED' },
        { dayId: 'day-2', status: 'COMPLETED' },
        { dayId: 'day-3', status: 'UNLOCKED' },
      ]);
    });

    it('unlocks a day whose previous day is completed even if an earlier day is not', async () => {
      mockGetCurriculumDays.mockResolvedValue([
        { id: 'day-1' },
        { id: 'day-2' },
        { id: 'day-3' },
        { id: 'day-4' },
      ]);
      mockGetDayCompletions.mockResolvedValue([
        { curriculum_day_id: 'day-1' },
        { curriculum_day_id: 'day-3' },
      ]);

      await expect(service.getDayStatuses(traineeId)).resolves.toEqual([
        { dayId: 'day-1', status: 'COMPLETED' },
        { dayId: 'day-2', status: 'UNLOCKED' },
        { dayId: 'day-3', status: 'COMPLETED' },
        { dayId: 'day-4', status: 'UNLOCKED' },
      ]);
    });

    it('continues progression across course boundaries', async () => {
      mockGetCurriculumDays.mockResolvedValue([
        { id: 'day-1', course: { sort_order: 1 } },
        { id: 'day-2', course: { sort_order: 1 } },
        { id: 'day-3', course: { sort_order: 2 } },
      ]);
      mockGetDayCompletions.mockResolvedValue([
        { curriculum_day_id: 'day-1' },
        { curriculum_day_id: 'day-2' },
      ]);

      await expect(service.getDayStatuses(traineeId)).resolves.toEqual([
        { dayId: 'day-1', status: 'COMPLETED' },
        { dayId: 'day-2', status: 'COMPLETED' },
        { dayId: 'day-3', status: 'UNLOCKED' },
      ]);
    });

    it('marks every day completed when all have completion records', async () => {
      mockGetDayCompletions.mockResolvedValue(days.map((day) => ({ curriculum_day_id: day.id })));

      await expect(service.getDayStatuses(traineeId)).resolves.toEqual([
        { dayId: 'day-1', status: 'COMPLETED' },
        { dayId: 'day-2', status: 'COMPLETED' },
        { dayId: 'day-3', status: 'COMPLETED' },
      ]);
    });

    it('uses only the completion records returned for this trainee', async () => {
      // The repository is responsible for filtering by traineeId.
      // The service only uses the completion rows it receives.
      mockGetDayCompletions.mockResolvedValue([{ curriculum_day_id: 'day-1' }]);

      await service.getDayStatuses(traineeId);

      expect(mockGetDayCompletions).toHaveBeenCalledWith(traineeId);
    });

    it('fetches days and completions in bulk rather than querying per day', async () => {
      await service.getDayStatuses(traineeId);

      expect(mockGetCurriculumDays).toHaveBeenCalledTimes(1);
      expect(mockGetDayCompletions).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDayStatus', () => {
    it('returns the status for the requested day', async () => {
      mockGetDayCompletions.mockResolvedValue([{ curriculum_day_id: 'day-1' }]);

      await expect(service.getDayStatus(traineeId, 'day-2')).resolves.toBe('UNLOCKED');
    });

    it('throws NotFoundError for an unknown day', async () => {
      await expect(service.getDayStatus(traineeId, 'unknown-day')).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });

  describe('assertDayUnlocked', () => {
    it('does not throw for an unlocked day', async () => {
      await expect(service.assertDayUnlocked(traineeId, 'day-1')).resolves.toBeUndefined();
    });

    it('does not throw for a completed day', async () => {
      mockGetDayCompletions.mockResolvedValue([{ curriculum_day_id: 'day-1' }]);

      await expect(service.assertDayUnlocked(traineeId, 'day-1')).resolves.toBeUndefined();
    });

    it('throws DayLockedError for a locked day', async () => {
      await expect(service.assertDayUnlocked(traineeId, 'day-2')).rejects.toBeInstanceOf(
        DayLockedError
      );
    });
  });

  describe('assertTaskUnlocked', () => {
    it('allows access when the task belongs to an unlocked day', async () => {
      await expect(service.assertTaskUnlocked(traineeId, 'task-1')).resolves.toBeUndefined();

      expect(mockGetTaskById).toHaveBeenCalledWith('task-1');
    });

    it('throws DayLockedError when the task belongs to a locked day', async () => {
      mockGetTaskById.mockResolvedValue({
        id: 'task-2',
        curriculum_day_id: 'day-2',
      });

      await expect(service.assertTaskUnlocked(traineeId, 'task-2')).rejects.toBeInstanceOf(
        DayLockedError
      );
    });

    it('throws NotFoundError when the task does not exist', async () => {
      mockGetTaskById.mockResolvedValue(null);

      await expect(service.assertTaskUnlocked(traineeId, 'unknown-task')).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });

  describe('taskStatus', () => {
    it('returns not_started when there is no progress row', () => {
      expect(service.taskStatus(null)).toBe('not_started');
    });

    it('returns completed when the progress row is completed', () => {
      expect(
        service.taskStatus({
          status: 'completed',
          code_updated_at: null,
          files: null,
        } as never)
      ).toBe('completed');
    });

    it('returns in_progress when code has been updated', () => {
      expect(
        service.taskStatus({
          status: 'not_started',
          code_updated_at: new Date(),
          files: null,
        } as never)
      ).toBe('in_progress');
    });

    it('returns in_progress when files have been saved', () => {
      expect(
        service.taskStatus({
          status: 'not_started',
          code_updated_at: null,
          files: {},
        } as never)
      ).toBe('in_progress');
    });

    it('returns not_started when a row exists but no code has been saved', () => {
      expect(
        service.taskStatus({
          status: 'not_started',
          code_updated_at: null,
          files: null,
        } as never)
      ).toBe('not_started');
    });
  });
});
