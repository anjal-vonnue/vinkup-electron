import type { ProfileDay } from '@itp/types';
import { istDateString, toIstDateString } from '../../utils/istDate.js';

export const DAILY_ACTIVITY_DAYS = 7;

type ActivityRow = { date: Date; active_seconds: number };
type TypingRow = { wpm: number; taken_at: Date };

/**
 * The last 7 calendar days, newest first. Days with no activity are included with 0 seconds.
 * `typingWpm` is the rounded average of that day's typing results, or null if there were none.
 * Pure: it only reorganises the rows it is given.
 */
export function buildDailyActivity(
  activity: ActivityRow[],
  typing: TypingRow[],
  now: Date = new Date()
): ProfileDay[] {
  // activity_log.date is a @db.Date column: Prisma returns it as midnight UTC of that day.
  const secondsByDate = new Map(
    activity.map((row) => [row.date.toISOString().slice(0, 10), row.active_seconds])
  );

  const wpmsByDate = new Map<string, number[]>();
  for (const row of typing) {
    const date = toIstDateString(row.taken_at);
    wpmsByDate.set(date, [...(wpmsByDate.get(date) ?? []), row.wpm]);
  }

  return Array.from({ length: DAILY_ACTIVITY_DAYS }, (_, daysAgo) => {
    const date = istDateString(daysAgo, now);
    const wpms = wpmsByDate.get(date);
    const averageWpm = wpms ? wpms.reduce((sum, wpm) => sum + wpm, 0) / wpms.length : null;

    return {
      date,
      timeSpentSeconds: secondsByDate.get(date) ?? 0,
      typingWpm: averageWpm === null ? null : Math.round(averageWpm),
      isToday: daysAgo === 0,
    };
  });
}
