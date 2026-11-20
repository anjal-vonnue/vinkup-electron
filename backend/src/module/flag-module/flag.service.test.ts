import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeEvent } from '@itp/types';
import { NotFoundError } from '../../errors/AppError';

const notify = vi.hoisted(() => ({
  publishToMentor: vi.fn<(traineeId: string, event: RealtimeEvent) => Promise<void>>(),
}));
const progress = vi.hoisted(() => ({
  assertDayUnlocked: vi.fn(),
}));

vi.mock('../realtime-module/realtime.notify', () => notify);
vi.mock('../progress-module/progress.service', () => ({
  ProgressService: class {
    assertDayUnlocked = progress.assertDayUnlocked;
  },
}));

import { FlagService } from './flag.service';

const traineeId = 'trainee-1';
const taskId = 'html-day-01-t-1';

const repository = {
  findTask: vi.fn(),
  createFlag: vi.fn(),
  findRecentFlag: vi.fn(),
};

describe('FlagService', () => {
  let service: FlagService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FlagService(repository);

    progress.assertDayUnlocked.mockResolvedValue(undefined);
    repository.findTask.mockResolvedValue({ curriculum_day: { id: 'html-day-01' } });
    repository.findRecentFlag.mockResolvedValue(null);
    repository.createFlag.mockResolvedValue({ id: 'flag-1' });
  });

  it('tells the mentor about a new flag', async () => {
    const before = Date.now();
    await service.logFlag({ type: 'TAB_SWITCH', durationMs: 12_000 }, traineeId, taskId);
    const after = Date.now();

    expect(repository.createFlag).toHaveBeenCalledWith(
      { type: 'TAB_SWITCH', durationMs: 12_000, taskId },
      'NORMAL',
      traineeId
    );
    expect(notify.publishToMentor).toHaveBeenCalledTimes(1);

    const [recipient, event] = notify.publishToMentor.mock.calls[0];
    expect(recipient).toBe(traineeId);
    expect(event).toMatchObject({
      type: 'flag.created',
      traineeId,
      taskId,
      flagId: 'flag-1',
    });
    if (event.type !== 'flag.created') throw new Error('expected a flag.created event');
    expect(new Date(event.timestamp).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(event.timestamp).getTime()).toBeLessThanOrEqual(after);
  });

  it('stores nothing and sends nothing for a duplicate flag', async () => {
    repository.findRecentFlag.mockResolvedValue({ id: 'flag-0' });

    await service.logFlag({ type: 'PASTE_BLOCKED' }, traineeId, taskId);

    expect(repository.createFlag).not.toHaveBeenCalled();
    expect(notify.publishToMentor).not.toHaveBeenCalled();
  });

  it('does not notify when the task does not exist', async () => {
    repository.findTask.mockResolvedValue(null);

    await expect(
      service.logFlag({ type: 'PASTE_BLOCKED' }, traineeId, taskId)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(notify.publishToMentor).not.toHaveBeenCalled();
  });
});
