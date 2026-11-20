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
