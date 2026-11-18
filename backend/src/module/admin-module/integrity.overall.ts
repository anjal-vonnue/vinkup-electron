import type { TraineeIntegrityItem } from '@itp/types';
import { buildDayIntegrity, type ScoredFlagEvent } from '../day-module/integrity.scoring.js';

export type ProgressRow = { traineeId: string; taskId: string; dayId: string };

/** A flag event, with the day its task belongs to. */
export type FlagRow = ScoredFlagEvent & { traineeId: string; dayId: string };

type BuildInput = {
  /** Every trainee that should appear in the list, including those with no data. */
  traineeIds: string[];
  progressRows: ProgressRow[];
  flagRows: FlagRow[];
};

/** Plain average, NOT rounded. `null` for an empty list. */
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function groupBy<T>(rows: T[], getKey: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

/**
 * The score of every day this trainee has worked on (same rule as the trainee-facing API):
 * a task counts if it has a progress row OR at least one flag event, submitted or not.
 * A day with nothing started never appears, so it counts as neither 100 nor 0.
 */
function dayScoresForTrainee(progress: ProgressRow[], flags: FlagRow[]): number[] {
  const taskIdsByDay = new Map<string, Set<string>>();
  const addTask = (dayId: string, taskId: string) => {
    const tasks = taskIdsByDay.get(dayId);
    if (tasks) tasks.add(taskId);
    else taskIdsByDay.set(dayId, new Set([taskId]));
  };

  for (const row of progress) addTask(row.dayId, row.taskId);
  for (const row of flags) addTask(row.dayId, row.taskId);

  const flagsByDay = groupBy(flags, (row) => row.dayId);
  const scores: number[] = [];

  for (const [dayId, taskIds] of taskIdsByDay) {
    const { score } = buildDayIntegrity({
      startedTaskIds: [...taskIds],
      events: flagsByDay.get(dayId) ?? [],
    });
    if (score !== null) scores.push(score);
  }

  return scores;
}
export function buildAdminIntegrity({ traineeIds, progressRows, flagRows }: BuildInput) {
  const progressByTrainee = groupBy(progressRows, (row) => row.traineeId);
  const flagsByTrainee = groupBy(flagRows, (row) => row.traineeId);

  const trainees: TraineeIntegrityItem[] = traineeIds.map((traineeId) => {
    const dayScores = dayScoresForTrainee(
      progressByTrainee.get(traineeId) ?? [],
      flagsByTrainee.get(traineeId) ?? []
    );
    const mean = average(dayScores);

    return {
      traineeId,
      score: mean === null ? null : Math.round(mean),
      daysScored: dayScores.length,
    };
  });

  return {
    trainees,
    traineesTotal: traineeIds.length,
  };
}
