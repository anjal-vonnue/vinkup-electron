import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
  listExpiredAttemptIds: vi.fn(),
  finalizeAttempt: vi.fn(),
}));

vi.mock('./checkpoint.repository', () => ({
  CheckpointRepository: class {
    listExpiredAttemptIds = repo.listExpiredAttemptIds;
    finalizeAttempt = repo.finalizeAttempt;
  },
}));

vi.mock('./checkpoint.notify', () => ({
  publishCheckpointActivity: vi.fn(),
}));

import { processExpiredCheckpointAttempts } from './checkpoint.deadline';
import { publishCheckpointActivity } from './checkpoint.notify';

function finalisedRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    checkpoint_id: 'checkpoint-1',
    trainee_id: `trainee-${id}`,
    status: 'SUBMITTED',
    trainee: { name: `Trainee ${id}`, email: `${id}@example.com` },
    ...overrides,
  };
}

describe('processExpiredCheckpointAttempts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.listExpiredAttemptIds.mockResolvedValue([]);
  });

  it('publishes one batched manager event per finalised attempt', async () => {
    repo.listExpiredAttemptIds.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    repo.finalizeAttempt
      .mockResolvedValueOnce(finalisedRow('a1'))
      .mockResolvedValueOnce(finalisedRow('a2'));

    const count = await processExpiredCheckpointAttempts(new Date());

    expect(count).toBe(2);
    expect(publishCheckpointActivity).toHaveBeenCalledTimes(1);
    expect(publishCheckpointActivity).toHaveBeenCalledWith([
      {
        checkpointId: 'checkpoint-1',
        reason: 'ATTEMPT_SUBMITTED',
        attemptId: 'a1',
        traineeId: 'trainee-a1',
        traineeName: 'Trainee a1',
      },
      {
        checkpointId: 'checkpoint-1',
        reason: 'ATTEMPT_SUBMITTED',
        attemptId: 'a2',
        traineeId: 'trainee-a2',
        traineeName: 'Trainee a2',
      },
    ]);
  });

  it('does not publish when the attempt no longer exists', async () => {
    repo.listExpiredAttemptIds.mockResolvedValue([{ id: 'a1' }]);
    repo.finalizeAttempt.mockResolvedValue(null);

    const count = await processExpiredCheckpointAttempts(new Date());

    expect(count).toBe(0);
    expect(publishCheckpointActivity).not.toHaveBeenCalled();
  });
});
