import { describe, expect, it, vi } from 'vitest';
import type { RealtimeEvent } from '@itp/types';
import { RealtimeBroker } from './realtime.broker';

const submitted: RealtimeEvent = {
  type: 'task.submitted',
  traineeId: 'trainee-1',
  traineeName: 'Asha',
  taskId: 'task-1',
  taskTitle: 'Profile page',
  submissionCount: 2,
  submittedAt: '2026-11-18T10:00:00.000Z',
};

describe('RealtimeBroker', () => {
  it('writes each event as one SSE data frame', () => {
    const broker = new RealtimeBroker();
    const write = vi.fn();
    broker.subscribe('mentor-1', { write });

    broker.publish('mentor-1', submitted);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(`data: ${JSON.stringify(submitted)}\n\n`);
  });

  it('sends to every tab the same user has open', () => {
    const broker = new RealtimeBroker();
    const firstTab = vi.fn();
    const secondTab = vi.fn();
    broker.subscribe('trainee-1', { write: firstTab });
    broker.subscribe('trainee-1', { write: secondTab });

    broker.publish('trainee-1', submitted);

    expect(firstTab).toHaveBeenCalledTimes(1);
    expect(secondTab).toHaveBeenCalledTimes(1);
  });

  it('never sends another user their events', () => {
    const broker = new RealtimeBroker();
    const other = vi.fn();
    broker.subscribe('mentor-2', { write: other });

    broker.publish('mentor-1', submitted);

    expect(other).not.toHaveBeenCalled();
  });

  it('stops writing after the stream is unsubscribed', () => {
    const broker = new RealtimeBroker();
    const write = vi.fn();
    const unsubscribe = broker.subscribe('trainee-1', { write });

    unsubscribe();
    broker.publish('trainee-1', submitted);

    expect(write).not.toHaveBeenCalled();
    expect(broker.connectionCount('trainee-1')).toBe(0);
  });

  it('ignores a closed stream instead of throwing', () => {
    const broker = new RealtimeBroker();
    const healthy = vi.fn();
    broker.subscribe('trainee-1', {
      write: () => {
        throw new Error('socket closed');
      },
    });
    broker.subscribe('trainee-1', { write: healthy });

    expect(() => broker.publish('trainee-1', submitted)).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
  });
});
