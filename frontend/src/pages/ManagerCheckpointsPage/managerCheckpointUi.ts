import type { ManagerCheckpointSummary } from '@itp/types';

/**
 * Whether a manager can still usefully cancel a checkpoint.
 *
 * Cancelling only matters while the window is open (or before it opens): it
 * stops trainees entering and finalises any running attempt. Once the whole
 * scheduled window has elapsed there is nothing left to cancel, and marking
 * the checkpoint cancelled would hide its attempts and results from trainees.
 */
export function canCancelCheckpoint(
  checkpoint: Pick<ManagerCheckpointSummary, 'status' | 'startAt' | 'durationMinutes'>,
  now = Date.now()
): boolean {
  if (checkpoint.status !== 'SCHEDULED') return false;
  if (!checkpoint.startAt) return true;
  const start = new Date(checkpoint.startAt).getTime();
  if (Number.isNaN(start)) return true;
  return now <= start + checkpoint.durationMinutes * 60_000;
}
