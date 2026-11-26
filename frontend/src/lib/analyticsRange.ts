import { todayKey } from './platformDate';

/** The time periods a mentor can pick for the team analytics. */
export const ANALYTICS_PERIODS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last 12 months' },
] as const;

export const DEFAULT_PERIOD_DAYS = 30;

/** The "Custom range" option: the mentor picks From and To. */
export const CUSTOM_PERIOD = 'custom';

/** The longest range the backend accepts, in days (both ends included). */
export const MAX_RANGE_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Number of calendar days from `from` to `to`, both included (same formula as the backend). */
function daysInRange(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
}

/**
 * Why a custom range can't be used, or null when it is fine. Same rules as the backend.
 * Dates are 'YYYY-MM-DD'; `today` is today in India time.
 */
export function customRangeError(
  from: string,
  to: string,
  today: string = todayKey()
): string | null {
  if (!from || !to) return 'Choose both dates.';
  if (to > today) return '“To” can’t be after today.';
  if (from > to) return '“From” must be on or before “To”.';
  if (daysInRange(from, to) > MAX_RANGE_DAYS) {
    return `Choose a range of at most ${MAX_RANGE_DAYS} days.`;
  }
  return null;
}

/**
 * The last `days` calendar days in India time, today included, as the API's `from` and `to`.
 * Example on 13 Nov 2026: periodRange(7) -> { from: '2026-11-07', to: '2026-11-13' }
 */
export function periodRange(days: number, now: Date = new Date()): { from: string; to: string } {
  return {
    from: todayKey(new Date(now.getTime() - (days - 1) * DAY_MS)),
    to: todayKey(now),
  };
}
