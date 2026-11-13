import type { AdminTraineeSummary } from '@itp/types';
import { INTEGRITY_MID_MIN } from './Integrityband';
import { formatDurationHM } from './formatTime';

/** Default order of the mentor's trainee list: by name, A to Z, ignoring case. */
export function sortTraineesByName(trainees: AdminTraineeSummary[]): AdminTraineeSummary[] {
  return [...trainees].sort(
    (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
      a.email.localeCompare(b.email)
  );
}

/** "CSS · Day 3 — Flexbox", or "Finished" when the trainee has no day left (currentDay is null). */
export function formatCurrentDay(day: AdminTraineeSummary['currentDay']): string {
  if (!day) return 'Finished';
  return `${day.courseTitle} · Day ${day.dayNumber} — ${day.title}`;
}

/** The backend sends an IST calendar day ("2026-10-06"), or null if the trainee never logged time. */
export function formatLastActive(date: string | null): string {
  return date ?? 'Never';
}

/** Share of the curriculum completed, 0 to 100. */
export function progressPercent(daysCompleted: number, totalDays: number): number {
  if (totalDays <= 0) return 0;
  return Math.min(100, Math.max(0, (daysCompleted / totalDays) * 100));
}

/** Numbers for the cohort summary cards on /admin. All counts, never negative. */
export type CohortSummary = {
  traineeCount: number;
  finishedCount: number; // currentDay === null
  averageProgressPercent: number; // 0–100, whole number
  averageDaysCompleted: number; // one decimal place
  totalDays: number; // curriculum length, from the first row
  activeTodayCount: number; // todayActiveSeconds > 0
  flagsThisWeek: number; // sum of flagsLast7Days
  flaggedTraineeCount: number; // rows with flagsLast7Days > 0
};

const EMPTY_SUMMARY: CohortSummary = {
  traineeCount: 0,
  finishedCount: 0,
  averageProgressPercent: 0,
  averageDaysCompleted: 0,
  totalDays: 0,
  activeTodayCount: 0,
  flagsThisWeek: 0,
  flaggedTraineeCount: 0,
};

/** Cohort totals and averages, computed from the trainee list the page already loaded. */
export function summarizeCohort(trainees: AdminTraineeSummary[]): CohortSummary {
  const count = trainees.length;
  if (count === 0) return EMPTY_SUMMARY;

  let progressSum = 0;
  let daysSum = 0;
  let finishedCount = 0;
  let activeTodayCount = 0;
  let flagsThisWeek = 0;
  let flaggedTraineeCount = 0;

  for (const trainee of trainees) {
    progressSum += progressPercent(trainee.daysCompleted, trainee.totalDays);
    daysSum += trainee.daysCompleted;
    if (trainee.currentDay === null) finishedCount += 1;
    if (trainee.todayActiveSeconds > 0) activeTodayCount += 1;
    flagsThisWeek += trainee.flagsLast7Days;
    if (trainee.flagsLast7Days > 0) flaggedTraineeCount += 1;
  }

  return {
    traineeCount: count,
    finishedCount,
    averageProgressPercent: Math.round(progressSum / count),
    averageDaysCompleted: Math.round((daysSum / count) * 10) / 10,
    totalDays: trainees[0].totalDays,
    activeTodayCount,
    flagsThisWeek,
    flaggedTraineeCount,
  };
}

/** The reasons a mentor should look at a trainee. The labels are what the badge shows. */
export const ATTENTION_REASONS = {
  inactive: 'Inactive 2+ days',
  behind: 'Behind cohort',
  lowIntegrity: 'Low integrity score',
} as const;

/** Informational only: a new trainee and one who never opens the platform look the same. */
export const NOT_STARTED_NOTE = 'Not started yet';

export const INACTIVE_AFTER_DAYS = 2;
export const BEHIND_BY_MORE_THAN_DAYS = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from one "YYYY-MM-DD" calendar day to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

/** Median of `daysCompleted` across the cohort (the average of the middle two for an even count). */
export function medianDaysCompleted(trainees: AdminTraineeSummary[]): number {
  if (trainees.length === 0) return 0;
  const sorted = trainees.map((t) => t.daysCompleted).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Every reason this trainee needs attention, in a fixed order; an empty list means none.
 * `today` is "YYYY-MM-DD" (see `todayKey`). `cohortMedian` comes from `medianDaysCompleted`;
 * if you leave it out, "Behind cohort" can never apply.
 */
export function needsAttention(
  t: AdminTraineeSummary,
  today: string,
  cohortMedian: number = t.daysCompleted
): string[] {
  const reasons: string[] = [];

  const isFinished = t.currentDay === null;
  if (
    !isFinished &&
    t.lastActiveDate !== null &&
    daysBetween(t.lastActiveDate, today) >= INACTIVE_AFTER_DAYS
  ) {
    reasons.push(ATTENTION_REASONS.inactive);
  }

  if (cohortMedian - t.daysCompleted > BEHIND_BY_MORE_THAN_DAYS) {
    reasons.push(ATTENTION_REASONS.behind);
  }

  if (t.averageScore !== null && t.averageScore < INTEGRITY_MID_MIN) {
    reasons.push(ATTENTION_REASONS.lowIntegrity);
  }

  return reasons;
}

type CsvColumn = { header: string; value: (trainee: AdminTraineeSummary) => string | number };

/** The table's columns, in the table's order, with Email added after the name. */
const CSV_COLUMNS: CsvColumn[] = [
  { header: 'Trainee', value: (t) => t.name },
  { header: 'Email', value: (t) => t.email },
  { header: 'Progress', value: (t) => `${t.daysCompleted} / ${t.totalDays}` },
  { header: 'Current day', value: (t) => formatCurrentDay(t.currentDay) },
  { header: 'Today', value: (t) => formatDurationHM(t.todayActiveSeconds) },
  { header: 'Total active', value: (t) => formatDurationHM(t.totalActiveSeconds) },
  { header: 'WPM', value: (t) => t.latestWpm ?? '—' },
  {
    header: 'Integrity Score',
    value: (t) => (t.averageScore !== null ? `${t.averageScore}/100` : '—'),
  },
  { header: 'Last active', value: (t) => formatLastActive(t.lastActiveDate) },
];

/** Wraps a value in quotes when it has a comma, a quote or a line break; doubles inner quotes. */
function escapeCsvValue(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The trainee table as CSV: one header row, then one row per trainee, in the order given.
 * Pass the rows the table shows (after search, filter and sort) to export the current view.
 * Lines end with "\n".
 */
export function toCsv(trainees: AdminTraineeSummary[]): string {
  const header = CSV_COLUMNS.map((column) => escapeCsvValue(column.header)).join(',');
  const rows = trainees.map((trainee) =>
    CSV_COLUMNS.map((column) => escapeCsvValue(column.value(trainee))).join(',')
  );
  return [header, ...rows].join('\n');
}
