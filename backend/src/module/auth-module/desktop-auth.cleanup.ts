import { env } from '../../config/env';
import { desktopAuthService, type DesktopAuthService } from './desktop-auth.service';

type CleanupService = Pick<DesktopAuthService, 'cleanupExpiredTransactions'>;

/**
 * Owns the periodic cleanup sweep only. The expiry rules live in the auth
 * service; request handling never starts a sweep.
 */
export class DesktopTransactionCleanupScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly service: CleanupService = desktopAuthService,
    private readonly intervalMs: number = env.DESKTOP_TRANSACTION_CLEANUP_INTERVAL_MS
  ) {}

  start(): void {
    if (this.timer) return;

    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
    void this.tick();
    console.info('[desktop-auth] transaction cleanup started');
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.inFlight) await this.inFlight;
    console.info('[desktop-auth] transaction cleanup stopped');
  }

  private tick(): Promise<void> {
    // Multiple backend instances may sweep at once; deleteMany is idempotent,
    // and this guard additionally avoids overlapping sweeps in one instance.
    if (this.running) return Promise.resolve();
    this.running = true;

    const work = (async () => {
      try {
        const deleted = await this.service.cleanupExpiredTransactions();
        if (deleted > 0) {
          console.info(`[desktop-auth] removed ${deleted} expired transaction(s)`);
        }
      } catch (error) {
        // A failed sweep must never take the backend down; the next tick retries.
        console.error('[desktop-auth] transaction cleanup failed', error);
      } finally {
        this.running = false;
        this.inFlight = null;
      }
    })();

    this.inFlight = work;
    return work;
  }
}

export const desktopTransactionCleanupScheduler = new DesktopTransactionCleanupScheduler();
