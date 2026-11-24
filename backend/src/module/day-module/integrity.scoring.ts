import type { DayIntegrityResponse } from '@itp/types';

/**
 * Pure scoring functions: no database, no req/res. Easy to unit test.
 *
 * Local types on purpose: the existing flag-tracking code is not touched, and the
 * database enum has WINDOW_BLUR even though the shared FlagEventType does not.
 */
export type IntegrityEventType = 'FULLSCREEN_EXIT' | 'TAB_SWITCH' | 'PASTE_BLOCKED' | 'WINDOW_BLUR';
export type IntegrityPriority = 'LOW' | 'NORMAL' | 'HIGH';

/**
 * True for flag types that count towards the integrity score.
 * IDLE is shown to mentors but is never scored. It must be dropped before scoring, not given
 * 0 points: any flag makes its task count as "worked on", which would change the average.
 */
export function isScoredFlag<T extends { type: string }>(
  row: T
): row is T & { type: IntegrityEventType } {
  return row.type !== 'IDLE';
}

export type ScoredFlagEvent = {
  taskId: string;
  type: IntegrityEventType;
  reviewPriority: IntegrityPriority;
  durationMs: number | null;
};

/** All the numbers in one place, so the model is easy to read and to change. */
export const SCORING = {
  MAX_SCORE: 100,
  /** Being away for less than this is treated as accidental and costs nothing. */
  SHORT_AWAY_MS: 10_000,

  PASTE_PENALTY: 10,
  PASTE_MAX_COUNTED: 5, // repeated paste attempts stop adding after 5 per task

  TAB_SWITCH_BASE: 3,
  TAB_SWITCH_MAX_EXTRA_MINUTES: 6, // max 9 points per event

  FULLSCREEN_BASE: 4,
  FULLSCREEN_MAX_EXTRA_MINUTES: 7, // max 11 points per event

  // WINDOW_BLUR usually fires together with a tab switch / fullscreen exit,
  // so it is a small signal to avoid counting the same moment twice.
  BLUR_PENALTY: 1,
  BLUR_MAX_COUNTED: 2,

  PRIORITY_MULTIPLIER: { LOW: 1.0, NORMAL: 1.5, HIGH: 2 } as Record<IntegrityPriority, number>,
} as const;

function fullMinutes(durationMs: number): number {
  return Math.floor(durationMs / 60_000);
}

function isShortAway(durationMs: number | null): boolean {
  return durationMs !== null && durationMs < SCORING.SHORT_AWAY_MS;
}

/** Points taken off by ONE event, before the priority multiplier. */
function basePenalty(event: ScoredFlagEvent): number {
  const { durationMs } = event;

  switch (event.type) {
    case 'PASTE_BLOCKED':
      return SCORING.PASTE_PENALTY;

    case 'TAB_SWITCH': {
      if (isShortAway(durationMs)) return 0;
      const extra = durationMs === null ? 0 : fullMinutes(durationMs);
      return SCORING.TAB_SWITCH_BASE + Math.min(extra, SCORING.TAB_SWITCH_MAX_EXTRA_MINUTES);
    }

    case 'FULLSCREEN_EXIT': {
      // Leaving fullscreen is a deliberate action, so it always counts.
      const extra = durationMs === null ? 0 : fullMinutes(durationMs);
      return SCORING.FULLSCREEN_BASE + Math.min(extra, SCORING.FULLSCREEN_MAX_EXTRA_MINUTES);
    }

    case 'WINDOW_BLUR':
      return isShortAway(durationMs) ? 0 : SCORING.BLUR_PENALTY;
  }
}

/** Score for ONE task: 100 minus penalties, never below 0. Not rounded yet. */
export function calculateTaskScore(events: ScoredFlagEvent[]): number {
  let penalty = 0;
  let pasteCounted = 0;
  let blurCounted = 0;

  for (const event of events) {
    if (event.type === 'PASTE_BLOCKED') {
      if (pasteCounted >= SCORING.PASTE_MAX_COUNTED) continue;
      pasteCounted += 1;
    }
    if (event.type === 'WINDOW_BLUR') {
      if (blurCounted >= SCORING.BLUR_MAX_COUNTED) continue;
      blurCounted += 1;
    }
    penalty += basePenalty(event) * SCORING.PRIORITY_MULTIPLIER[event.reviewPriority];
  }

  return Math.max(0, SCORING.MAX_SCORE - penalty);
}

/** Day score = average of the task scores, rounded. `null` when no task was worked on. */
export function calculateDayScore(taskScores: number[]): number | null {
  if (taskScores.length === 0) return null;
  const average = taskScores.reduce((sum, score) => sum + score, 0) / taskScores.length;
  return Math.min(SCORING.MAX_SCORE, Math.max(0, Math.round(average)));
}

type BuildInput = {
  /** Tasks of THIS day that the trainee has worked on (has a task_progress row). */
  startedTaskIds: string[];
  events: ScoredFlagEvent[];
};

/**
 * Builds the response for one day.
 * Only events that belong to a started task of this day are used. Everything else is ignored,
 * so unstarted tasks and other days can never change the score.
 */
export function buildDayIntegrity({ startedTaskIds, events }: BuildInput): DayIntegrityResponse {
  const startedSet = new Set(startedTaskIds);
  const eventsByTask = new Map<string, ScoredFlagEvent[]>(startedTaskIds.map((id) => [id, []]));

  for (const event of events) {
    if (!startedSet.has(event.taskId)) continue;
    eventsByTask.get(event.taskId)?.push(event);
  }

  const taskScores = [...eventsByTask.values()].map(calculateTaskScore);

  return {
    score: calculateDayScore(taskScores),
  };
}
