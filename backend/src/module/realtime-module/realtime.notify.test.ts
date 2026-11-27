import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeEvent } from '@itp/types';

const prisma = vi.hoisted(() => ({
  admin: { findMany: vi.fn() },
  trainee: { findUnique: vi.fn() },
}));

vi.mock('../../lib/prisma', () => ({ prisma }));

import { publishToManagers } from './realtime.notify';
import { realtimeBroker } from './realtime.broker';

const publishSpy = vi.spyOn(realtimeBroker, 'publish');

const started: RealtimeEvent = {
  type: 'checkpoint.updated',
  checkpointId: 'checkpoint-1',
  reason: 'ATTEMPT_STARTED',
  attemptId: 'attempt-1',
  traineeId: 'trainee-1',
  traineeName: 'Asha',
  changedAt: '2026-11-27T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('publishToManagers', () => {
  it('sends the event to every active manager', async () => {
    prisma.admin.findMany.mockResolvedValue([{ id: 'manager-1' }, { id: 'manager-2' }]);

    await publishToManagers(started);

    expect(prisma.admin.findMany).toHaveBeenCalledWith({
      where: { role: 'MANAGER', is_active: true },
      select: { id: true },
    });
    expect(publishSpy).toHaveBeenCalledTimes(2);
    expect(publishSpy).toHaveBeenCalledWith('manager-1', started);
    expect(publishSpy).toHaveBeenCalledWith('manager-2', started);
  });

  it('sends a batch after one manager lookup', async () => {
    prisma.admin.findMany.mockResolvedValue([{ id: 'manager-1' }]);
    const submitted: RealtimeEvent = {
      ...started,
      reason: 'ATTEMPT_SUBMITTED',
      attemptId: 'attempt-2',
    };

    await publishToManagers([started, submitted]);

    expect(prisma.admin.findMany).toHaveBeenCalledTimes(1);
    expect(publishSpy).toHaveBeenCalledWith('manager-1', started);
    expect(publishSpy).toHaveBeenCalledWith('manager-1', submitted);
  });

  it('does nothing when there is no manager', async () => {
    prisma.admin.findMany.mockResolvedValue([]);

    await publishToManagers(started);

    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('never throws when the manager lookup fails', async () => {
    prisma.admin.findMany.mockRejectedValue(new Error('database down'));

    await expect(publishToManagers(started)).resolves.toBeUndefined();
    expect(publishSpy).not.toHaveBeenCalled();
  });
});
