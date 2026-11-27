import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopTransactionCleanupScheduler } from './desktop-auth.cleanup';
import type { DesktopAuthService } from './desktop-auth.service';

type CleanupService = Pick<DesktopAuthService, 'cleanupExpiredTransactions'>;

const cleanup = vi.fn();
const service = { cleanupExpiredTransactions: cleanup } as CleanupService;

let infoSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  cleanup.mockReset();
  cleanup.mockResolvedValue(0);
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('DesktopTransactionCleanupScheduler', () => {
  it('sweeps immediately on start and then on the configured interval', async () => {
    const scheduler = new DesktopTransactionCleanupScheduler(service, 60_000);

    scheduler.start();
    expect(cleanup).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(cleanup).toHaveBeenCalledTimes(2);

    await scheduler.stop();
  });

  it('does not overlap two sweeps in the same instance', async () => {
    let finishSweep: () => void = () => {};
    cleanup.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          finishSweep = () => resolve(0);
        })
    );
    const scheduler = new DesktopTransactionCleanupScheduler(service, 60_000);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(cleanup).toHaveBeenCalledTimes(1);

    finishSweep();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cleanup).toHaveBeenCalledTimes(2);
    finishSweep();
    await vi.advanceTimersByTimeAsync(1);
    await scheduler.stop();
  });

  it('logs and survives a failed sweep', async () => {
    const failure = new Error('database unavailable');
    cleanup.mockRejectedValue(failure);
    const scheduler = new DesktopTransactionCleanupScheduler(service, 60_000);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1);

    expect(errorSpy).toHaveBeenCalledWith('[desktop-auth] transaction cleanup failed', failure);
    await expect(scheduler.stop()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('logs the number of removed transactions', async () => {
    cleanup.mockResolvedValue(3);
    const scheduler = new DesktopTransactionCleanupScheduler(service, 60_000);

    scheduler.start();
    await vi.advanceTimersByTimeAsync(1);

    expect(infoSpy).toHaveBeenCalledWith('[desktop-auth] removed 3 expired transaction(s)');
    await scheduler.stop();
  });

  it('does not restart twice and waits for an in-flight sweep on stop', async () => {
    let finishSweep: () => void = () => {};
    cleanup.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          finishSweep = () => resolve(1);
        })
    );
    const scheduler = new DesktopTransactionCleanupScheduler(service, 60_000);

    scheduler.start();
    scheduler.start();
    expect(cleanup).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopping = scheduler.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(stopped).toBe(false);

    finishSweep();
    await stopping;
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
