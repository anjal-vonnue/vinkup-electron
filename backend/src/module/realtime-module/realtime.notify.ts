import type { RealtimeEvent } from '@itp/types';
import { prisma } from '../../lib/prisma';
import { realtimeBroker } from './realtime.broker';

/**
 * Sends one event to the mentor currently assigned to this trainee.
 *
 * Does nothing when the trainee has no mentor yet, and never throws: a failed
 * notification must not fail the request that produced it. The REST data stays
 * the source of truth, so a missed event is recovered on the next page load.
 */
export async function publishToMentor(traineeId: string, event: RealtimeEvent): Promise<void> {
  try {
    const trainee = await prisma.trainee.findUnique({
      where: { id: traineeId },
      select: { mentor_id: true },
    });
    if (trainee?.mentor_id) realtimeBroker.publish(trainee.mentor_id, event);
  } catch {
    // Best effort; see above.
  }
}

/**
 * Sends one or more events to every active manager.
 *
 * Checkpoint management is shared: a second manager watching the list should
 * see a submission land even though the acting manager's own page reloads from
 * its REST response. Never throws, for the same reason as `publishToMentor`.
 */
export async function publishToManagers(events: RealtimeEvent | RealtimeEvent[]): Promise<void> {
  try {
    const managers = await prisma.admin.findMany({
      where: { role: 'MANAGER', is_active: true },
      select: { id: true },
    });
    if (managers.length === 0) return;

    const list = Array.isArray(events) ? events : [events];
    for (const manager of managers) {
      for (const event of list) realtimeBroker.publish(manager.id, event);
    }
  } catch {
    // Best effort; the next page load recovers the state.
  }
}
