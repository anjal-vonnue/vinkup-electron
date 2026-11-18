import type { TypingSummaryResponse } from '@itp/types';
import { istDateString, toIstDateString } from '../../utils/istDate.js';

/** How many calendar days (today included) the typing trend covers. */
export const TYPING_TREND_DAYS = 30;

type LatestTypingRow = { wpm: number; accuracy: number; taken_at: Date };
type TypingRow = { wpm: number; taken_at: Date };

function roundedAverage(values: number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * The dashboard's typing card: the latest attempt, today's rounded average WPM, and one
 * rounded average per Asia/Kolkata calendar day, oldest first.
 * Pure: it only reorganises the rows it is given (`recent` = the last TYPING_TREND_DAYS days).
 */
export function buildTypingSummary(
  latest: LatestTypingRow | null,
  recent: TypingRow[],
  now: Date = new Date()
): TypingSummaryResponse {
  const wpmsByDate = new Map<string, number[]>();
  for (const row of recent) {
    const date = toIstDateString(row.taken_at);
    wpmsByDate.set(date, [...(wpmsByDate.get(date) ?? []), row.wpm]);
  }

  const todayWpms = wpmsByDate.get(istDateString(0, now));

  return {
    latest: latest
      ? { wpm: latest.wpm, accuracy: latest.accuracy, takenAt: latest.taken_at.toISOString() }
      : null,
    todayAverageWpm: todayWpms ? roundedAverage(todayWpms) : null,
    trend: [...wpmsByDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, wpms]) => ({ date, averageWpm: roundedAverage(wpms) })),
  };
}
