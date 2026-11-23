import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckpointAttemptTime } from '@itp/types';

const api = vi.hoisted(() => ({
  getCheckpointAttemptTime: vi.fn(),
}));

vi.mock('../../api/checkpoints', () => ({
  getCheckpointAttemptTime: api.getCheckpointAttemptTime,
}));

import { useAttemptCountdown } from './useAttemptCountdown';

const attemptId = 'attempt-1';
const NOW = new Date('2026-11-23T10:00:00.000Z');

function renderCountdown(remainingSeconds: number, options: { enabled?: boolean } = {}) {
  const onExpire = vi.fn();
  const onAlreadySubmitted = vi.fn();
  const view = renderHook(() =>
    useAttemptCountdown({
      attemptId,
      deadlineAt: new Date(NOW.getTime() + remainingSeconds * 1000).toISOString(),
      serverNow: NOW.toISOString(),
      remainingSeconds,
      enabled: options.enabled ?? true,
      onExpire,
      onAlreadySubmitted,
    })
  );
  return { ...view, onExpire, onAlreadySubmitted };
}

function attemptTime(
  remainingSeconds: number,
  status: 'IN_PROGRESS' | 'SUBMITTED'
): CheckpointAttemptTime {
  return {
    serverNow: new Date().toISOString(),
    deadlineAt: new Date(Date.now() + remainingSeconds * 1000).toISOString(),
    remainingSeconds,
    status,
    submittedAt: status === 'SUBMITTED' ? new Date().toISOString() : null,
    submissionReason: status === 'SUBMITTED' ? 'TIME_EXPIRED' : null,
  };
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useAttemptCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    api.getCheckpointAttemptTime.mockReset();
    api.getCheckpointAttemptTime.mockResolvedValue(attemptTime(600, 'IN_PROGRESS'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats the remaining time', () => {
    const { result } = renderCountdown(125);

    expect(result.current.label).toBe('02:05');
    expect(result.current.expired).toBe(false);
  });

  it('includes hours for long attempts', () => {
    const { result } = renderCountdown(3725);

    expect(result.current.label).toBe('01:02:05');
  });

  it('ticks down once a second', async () => {
    const { result } = renderCountdown(10);

    await advance(3000);

    expect(result.current.remainingSeconds).toBe(7);
  });

  it('warns at five minutes and again at one minute', async () => {
    const five = renderCountdown(301);
    await advance(1000);
    expect(five.result.current.warning).toBe('five-minutes');
    five.unmount();

    const one = renderCountdown(61);
    await advance(1000);
    expect(one.result.current.warning).toBe('one-minute');
  });

  it('expires once and stops reporting a warning at zero', async () => {
    const { result, onExpire } = renderCountdown(2);

    await advance(3000);

    expect(result.current.expired).toBe(true);
    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.warning).toBeNull();
    expect(onExpire).toHaveBeenCalledTimes(1);

    await advance(10_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('does not auto-submit when the countdown is disabled', async () => {
    const { onExpire } = renderCountdown(1, { enabled: false });

    await advance(2000);

    expect(onExpire).not.toHaveBeenCalled();
  });

  it('re-syncs with the server deadline every fifteen seconds', async () => {
    api.getCheckpointAttemptTime.mockResolvedValue(attemptTime(30, 'IN_PROGRESS'));
    const { result } = renderCountdown(600);

    await advance(15_000);

    expect(api.getCheckpointAttemptTime).toHaveBeenCalledWith(attemptId);
    expect(result.current.remainingSeconds).toBe(30);
  });

  it('reports an attempt the server already submitted', async () => {
    api.getCheckpointAttemptTime.mockResolvedValue(attemptTime(0, 'SUBMITTED'));
    const { onAlreadySubmitted } = renderCountdown(600);

    await advance(15_000);

    expect(onAlreadySubmitted).toHaveBeenCalledTimes(1);
  });

  it('keeps ticking against the old deadline when the resync fails', async () => {
    api.getCheckpointAttemptTime.mockRejectedValue(new Error('offline'));
    const { result } = renderCountdown(10);

    await advance(15_000);

    expect(result.current.remainingSeconds).toBe(0);
    expect(result.current.expired).toBe(true);
  });
});
