import { useEffect } from 'react';

/** setTimeout clamps anything longer than this, so long waits are re-armed. */
const MAX_TIMEOUT_MS = 2_147_483_647;
/** How long to wait before retrying once the boundary has passed. */
const RETRY_MS = 5_000;
/** Fire just after the boundary so the server has definitely moved past it. */
const SETTLE_MS = 500;

/**
 * Calls `refresh` when a server-side availability boundary passes, so a
 * checkpoint that is "Upcoming" turns "Available" without a manual reload.
 *
 * `dueAt` is an absolute server timestamp (epoch ms) and `serverNow` is the
 * server clock from the same response. Together they compensate for a client
 * clock that is ahead of or behind the server. If the server still reports the
 * old state after the refresh (clock skew, or the request raced the boundary),
 * the refresh is retried until the caller's `dueAt` changes.
 */
export function useCheckpointRefreshAt(
  dueAt: number | null,
  serverNow: string | null | undefined,
  refresh: () => void
): void {
  useEffect(() => {
    if (dueAt === null || !serverNow) return;
    const serverNowMs = new Date(serverNow).getTime();
    if (Number.isNaN(serverNowMs)) return;

    // Server time minus client time. Subtracting it from the server deadline
    // gives the moment to wake up on this machine.
    const offset = serverNowMs - Date.now();
    const wakeAt = dueAt - offset + SETTLE_MS;

    let timer: ReturnType<typeof setTimeout>;

    const arm = () => {
      const remaining = wakeAt - Date.now();
      if (remaining > 0) {
        timer = setTimeout(arm, Math.min(remaining, MAX_TIMEOUT_MS));
        return;
      }
      refresh();
      // The response is the source of truth. If it still says the old state,
      // keep checking until the caller's boundary changes or it unmounts.
      timer = setTimeout(arm, RETRY_MS);
    };

    // Background tabs throttle timers, so re-check as soon as the tab is back.
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      arm();
    };

    arm();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [dueAt, serverNow, refresh]);
}
