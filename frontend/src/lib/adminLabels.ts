import type { AdminFlagEvent, DayStatus, FlagEventType, TaskStatus } from '@itp/types';
import { formatIstTime } from './formatDateTime';
import { formatMinutes } from './formatMinutes';

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

/** UNLOCKED is the trainee's current day: the one they can work on right now. */
export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  LOCKED: 'Locked',
  UNLOCKED: 'Current',
  COMPLETED: 'Completed',
};

export const FLAG_TYPE_LABELS: Record<FlagEventType, string> = {
  FULLSCREEN_EXIT: 'Left fullscreen',
  TAB_SWITCH: 'Switched tab',
  PASTE_BLOCKED: 'Paste blocked',
  WINDOW_BLUR: 'Window lost focus',
  IDLE: 'Idle',
};

/**
 * The "Event" text for a flag. Idle gets its length and start time, worded neutrally:
 * "Idle for 18 min (from 14:02)". Every other type uses its plain label.
 */
export function describeFlag(flag: Pick<AdminFlagEvent, 'type' | 'durationMs' | 'timestamp'>) {
  if (flag.type !== 'IDLE' || flag.durationMs === null) return FLAG_TYPE_LABELS[flag.type];

  const minutes = Math.max(1, Math.round(flag.durationMs / 60_000));
  const text = `Idle for ${formatMinutes(minutes)}`;

  // The server stamps a flag when it is sent, at the END of the idle stretch.
  const startedAtMs = Date.parse(flag.timestamp) - flag.durationMs;
  if (Number.isNaN(startedAtMs)) return text;
  return `${text} (from ${formatIstTime(new Date(startedAtMs).toISOString())})`;
}

export const FLAG_PRIORITY_LABELS: Record<AdminFlagEvent['reviewPriority'], string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
};

/** How long the trainee was away: "—", "<1 s", "12 s", "2 m 05 s". */
export function formatFlagDuration(durationMs: number | null): string {
  if (durationMs === null) return '—';
  if (durationMs < 1000) return '<1 s';

  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} m ${String(seconds).padStart(2, '0')} s`;
}
