import { todayKey } from './platformDate';

/** The time periods a mentor can pick for the team analytics. */
export const ANALYTICS_PERIODS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last 12 months' },
] as const;

export const DEFAULT_PERIOD_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

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
