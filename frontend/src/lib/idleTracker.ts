/** No React and no timers in this file, so it is easy to test. */

/**
 * No input on the task page for this long is recorded as an IDLE flag for the mentor.
 * Longer than the 5-minute active-time rule on purpose: reading or thinking often takes a while.
 */
export const IDLE_FLAG_AFTER_MS = 10 * 60_000;

/**
 * How long the quiet stretch that started at `idleSince` and ends at `now` lasted,
 * or null when it is too short to report. The whole stretch is returned, not only the part
 * over the threshold, so the mentor sees "Idle for 18 min", not "8 min".
 */
export function idleDurationToReport(idleSince: number, now: number): number | null {
  const idleMs = now - idleSince;
  return idleMs >= IDLE_FLAG_AFTER_MS ? idleMs : null;
}
