import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCheckpointRefreshAt } from './useCheckpointRefreshAt';

const NOW = new Date('2026-11-26T10:58:00.000Z');

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

describe('useCheckpointRefreshAt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes when the boundary passes, not before', async () => {
    const refresh = vi.fn();
    renderHook(() => useCheckpointRefreshAt(NOW.getTime() + 60_000, NOW.toISOString(), refresh));

    await advance(59_000);
    expect(refresh).not.toHaveBeenCalled();

    await advance(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('compensates for a client clock that is ahead of the server', async () => {
    const refresh = vi.fn();
    // The server says 10:58:00, but this machine thinks it is 10:58:30.
    vi.setSystemTime(new Date(NOW.getTime() + 30_000));

    renderHook(() =>
      useCheckpointRefreshAt(
        NOW.getTime() + 60_000, // server 10:59:00
        NOW.toISOString(),
        refresh
      )
    );

    // 10:59:00 on the server is 10:59:30 on this machine.
    await advance(59_000);
    expect(refresh).not.toHaveBeenCalled();

    await advance(2_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('retries when the server still reports the old state', async () => {
    const refresh = vi.fn();
    renderHook(() => useCheckpointRefreshAt(NOW.getTime() - 1, NOW.toISOString(), refresh));

    await advance(500);
    expect(refresh).toHaveBeenCalledTimes(1);

    await advance(5_000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a boundary', async () => {
    const refresh = vi.fn();
    renderHook(() => useCheckpointRefreshAt(null, NOW.toISOString(), refresh));

    await advance(60_000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
