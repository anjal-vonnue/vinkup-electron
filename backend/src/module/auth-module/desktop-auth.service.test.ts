import { describe, expect, it, vi } from 'vitest';
import { AuthRepository } from './auth.repository';
import { DesktopAuthRepository } from './desktop-auth.repository';
import { DesktopAuthService } from './desktop-auth.service';

const NOW = new Date('2026-01-01T12:00:00.000Z');

function makeService(retention = { failedMs: 60_000, consumedMs: 120_000 }) {
  const repository = {
    deleteExpiredTransactions: vi.fn().mockResolvedValue({ count: 2 }),
  };
  const service = new DesktopAuthService(
    repository as unknown as DesktopAuthRepository,
    {} as AuthRepository,
    () => NOW,
    retention
  );
  return { service, repository };
}

describe('DesktopAuthService.cleanupExpiredTransactions', () => {
  it('derives status-specific cutoffs from the configured retention', async () => {
    const { service, repository } = makeService();

    await expect(service.cleanupExpiredTransactions()).resolves.toBe(2);

    expect(repository.deleteExpiredTransactions).toHaveBeenCalledWith({
      expiredBefore: NOW,
      failedBefore: new Date(NOW.getTime() - 60_000),
      consumedBefore: new Date(NOW.getTime() - 120_000),
    });
  });

  it('accepts an explicit clock value for scheduled sweeps', async () => {
    const { service, repository } = makeService();
    const later = new Date(NOW.getTime() + 3_600_000);

    await service.cleanupExpiredTransactions(later);

    expect(repository.deleteExpiredTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ expiredBefore: later })
    );
  });

  it('propagates repository failures to the caller', async () => {
    const { service, repository } = makeService();
    repository.deleteExpiredTransactions.mockRejectedValue(new Error('cleanup failed'));

    await expect(service.cleanupExpiredTransactions()).rejects.toThrow('cleanup failed');
  });
});
