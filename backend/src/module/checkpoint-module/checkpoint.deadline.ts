import { CheckpointRepository } from './checkpoint.repository';

const repository = new CheckpointRepository();

const DEFAULT_INTERVAL_MS = 15_000;

/**
 * Finalises every attempt whose server-owned deadline has passed.
 *
 * This is deliberately independent of the browser: closing the tab, refreshing,
 * losing connectivity or crashing the renderer cannot keep an attempt open. The
 * same idempotent `finalizeAttempt` service is used by manual submission, so a
 * timeout and a last-moment manual submit cannot produce conflicting results.
 */
export async function processExpiredCheckpointAttempts(now = new Date()): Promise<number> {
  const expired = await repository.listExpiredAttemptIds(now);
  let finalised = 0;

  for (const attempt of expired) {
    const row = await repository.finalizeAttempt(attempt.id, 'TIME_EXPIRED', now);
    if (row?.status === 'SUBMITTED') finalised += 1;
  }

  if (finalised > 0) {
    console.info(`[checkpoint] auto-submitted ${finalised} expired attempt(s)`);
  }
  return finalised;
}

/** Starts the periodic deadline processor and returns a stop function. */
export function startCheckpointDeadlineProcessor(intervalMs = DEFAULT_INTERVAL_MS): () => void {
  let running = false;

  const tick = async () => {
    if (running) return; // never overlap two sweeps
    running = true;
    try {
      await processExpiredCheckpointAttempts();
    } catch (error) {
      console.error('[checkpoint] deadline sweep failed', error);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();

  return () => clearInterval(timer);
}
