import type { CheckpointUpdatedEvent } from '@itp/types';
import { publishToManagers } from '../realtime-module/realtime.notify';

type CheckpointActivity = {
  checkpointId: string;
  reason: CheckpointUpdatedEvent['reason'];
  attemptId?: string;
  traineeId?: string;
  traineeName?: string;
};

/**
 * Tells every active manager that a checkpoint changed, so an open list or
 * results page can re-read its REST data. Events are hints only: a missed one
 * is recovered on the next load, and publishing never fails the request.
 */
export async function publishCheckpointActivity(
  activity: CheckpointActivity | CheckpointActivity[]
): Promise<void> {
  const list = Array.isArray(activity) ? activity : [activity];
  if (list.length === 0) return;

  const changedAt = new Date().toISOString();
  await publishToManagers(
    list.map((entry) => ({ type: 'checkpoint.updated' as const, changedAt, ...entry }))
  );
}
