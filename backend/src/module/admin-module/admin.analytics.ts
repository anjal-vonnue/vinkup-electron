import type {
  AdminAnalyticsIntegrityPoint,
  AdminAnalyticsProgressPoint,
  AdminAnalyticsTaskStatus,
  AdminAnalyticsTraineeRow,
  AdminAnalyticsTypingPoint,
} from '@itp/types';
import { buildDayIntegrity } from '../day-module/integrity.scoring';
import type { FlagRow, ProgressRow } from './integrity.overall';

/**
 * Pure functions for GET /api/admin/analytics: no database, no req/res, easy to unit test.
 * Every date here is an IST calendar day as a "YYYY-MM-DD" string.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Every calendar day from `from` to `to`, both included. */
export function listDates(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let time = Date.parse(from); time <= Date.parse(to); time += MS_PER_DAY) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  return dates;
}

/** Rounds to one decimal place: 2.345 -> 2.3 */
function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Team progress line. For each date: completed curriculum days up to and including that date,
 * divided by the number of trainees. `completionDates` must include completions from before
 * the period too, so the line starts at the right height.
 */
export function buildProgressTrend(
  dates: string[],
  completionDates: string[],
  traineeCount: number
): AdminAnalyticsProgressPoint[] {
  return dates.map((date) => {
    if (traineeCount === 0) return { date, averageDaysCompleted: 0 };
    const completedSoFar = completionDates.filter((completed) => completed <= date).length;
    return { date, averageDaysCompleted: roundToOneDecimal(completedSoFar / traineeCount) };
  });
}

type TraineeInput = { id: string; name: string };
type ActivityInput = { traineeId: string; activeSeconds: number; codingSeconds: number };

/** One row per trainee (in the order given): all-time days completed and time in the period. */
export function buildTraineeComparison(
  trainees: TraineeInput[],
  completedDayCounts: Map<string, number>,
  activity: ActivityInput[],
  totalDays: number
): AdminAnalyticsTraineeRow[] {
  const activityByTrainee = new Map(activity.map((row) => [row.traineeId, row]));

  return trainees.map((trainee) => ({
    traineeId: trainee.id,
    name: trainee.name,
    daysCompleted: completedDayCounts.get(trainee.id) ?? 0,
    totalDays,
    codingSeconds: activityByTrainee.get(trainee.id)?.codingSeconds ?? 0,
    activeSeconds: activityByTrainee.get(trainee.id)?.activeSeconds ?? 0,
  }));
}

type StatusCount = { status: 'not_started' | 'in_progress' | 'completed'; count: number };

/**
 * Current task status. A trainee only has a task_progress row for tasks they opened, so
 * "not started" = every task for every trainee, minus the ones in progress or completed.
 */
export function buildTaskStatus(
  statusCounts: StatusCount[],
  totalTasks: number,
  traineeCount: number
): AdminAnalyticsTaskStatus {
  const countOf = (status: StatusCount['status']) =>
    statusCounts.find((row) => row.status === status)?.count ?? 0;

  const completed = countOf('completed');
  const inProgress = countOf('in_progress');
  const notStarted = Math.max(totalTasks * traineeCount - completed - inProgress, 0);

  return { completed, inProgress, notStarted };
}

type TypingInput = { traineeId: string; date: string; wpm: number };

/**
 * Typing trend: on each day someone took a test, the average of every trainee's latest WPM so
 * far. `results` must be oldest first and may start before `from`, so the line starts at the
 * right level; only days from `from` onwards get a point.
 */

export function buildTypingTrend(
  results: TypingInput[],
  from: string
): AdminAnalyticsTypingPoint[] {
  const latestWpm = new Map<string, number>(); // traineeId -> their latest WPM so far
  const points: AdminAnalyticsTypingPoint[] = [];

  results.forEach((result, i) => {
    latestWpm.set(result.traineeId, result.wpm);

    // One point per day, after that day's last test.
    const isLastOfDay = results[i + 1]?.date !== result.date;
    if (isLastOfDay && result.date >= from) {
      const values = [...latestWpm.values()];
      points.push({
        date: result.date,
        averageWpm: Math.round(values.reduce((sum, wpm) => sum + wpm, 0) / values.length),
        traineesIncluded: values.length,
      });
    }
  });

  return points;
}

type CompletionInput = { traineeId: string; dayId: string; date: string };

/**
 * Integrity trend: on each day a curriculum day was completed, the average score of every
 * completed day so far. Each day is scored like the trainee table does (buildDayIntegrity).
 * `completions` must be oldest first and may start before `from`; only days from `from`
 * onwards get a point. A completed day with no score (nothing worked on) is not counted.
 */
export function buildIntegrityTrend(
  completions: CompletionInput[],
  progressRows: ProgressRow[],
  flagRows: FlagRow[],
  from: string
): AdminAnalyticsIntegrityPoint[] {
  const scores: number[] = []; // scores of the completed days so far
  const points: AdminAnalyticsIntegrityPoint[] = [];

  completions.forEach((completion, i) => {
    const isThisDay = (row: { traineeId: string; dayId: string }) =>
      row.traineeId === completion.traineeId && row.dayId === completion.dayId;

    const dayFlags = flagRows.filter(isThisDay);
    // A task counts if it has a progress row OR a flag event (same rule as the table).
    const taskIds = new Set([
      ...progressRows.filter(isThisDay).map((row) => row.taskId),
      ...dayFlags.map((row) => row.taskId),
    ]);
    const { score } = buildDayIntegrity({ startedTaskIds: [...taskIds], events: dayFlags });
    if (score !== null) scores.push(score);

    // One point per day, after that day's last completion.
    const isLastOfDay = completions[i + 1]?.date !== completion.date;
    if (isLastOfDay && completion.date >= from && scores.length > 0) {
      points.push({
        date: completion.date,
        averageScore: Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length),
        daysScored: scores.length,
      });
    }
  });

  return points;
}
