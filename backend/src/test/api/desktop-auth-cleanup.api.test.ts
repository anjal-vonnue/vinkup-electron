import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { DesktopAuthService } from '../../module/auth-module/desktop-auth.service';
import { db } from './helpers/db';

/** The cleanup rules are exercised against real rows in every transaction status. */
const CODE_VERIFIER = 'a'.repeat(43);
const CODE_CHALLENGE = createHash('sha256').update(CODE_VERIFIER).digest('base64url');
const REDIRECT_URI = 'http://127.0.0.1:55555/callback';
const USER_ID = '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11';
const HOUR_MS = 3_600_000;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

type SeedOverrides = {
  status?: string;
  expiresAt?: Date;
  handoffExpiresAt?: Date | null;
  consumedAt?: Date | null;
  handoffConsumedAt?: Date | null;
};

async function seedTransaction(overrides: SeedOverrides = {}) {
  const handoffCode = randomBytes(32).toString('base64url');
  const now = Date.now();
  const row = await db.desktop_auth_transaction.create({
    data: {
      id: randomUUID(),
      state: randomBytes(24).toString('base64url'),
      code_challenge: CODE_CHALLENGE,
      code_challenge_method: 'S256',
      loopback_redirect_uri: REDIRECT_URI,
      status: overrides.status ?? 'pending',
      user_id: USER_ID,
      user_email: 'trainee@vonnue.com',
      user_name: 'Test Trainee',
      user_role: 'trainee',
      error_code: null,
      handoff_code_hash: sha256(handoffCode),
      handoff_expires_at:
        overrides.handoffExpiresAt === undefined
          ? new Date(now + 60_000)
          : overrides.handoffExpiresAt,
      handoff_consumed_at: overrides.handoffConsumedAt ?? null,
      expires_at: overrides.expiresAt ?? new Date(now + 5 * 60_000),
      consumed_at: overrides.consumedAt ?? null,
      created_at: new Date(now - 2 * HOUR_MS),
    },
  });
  return { id: row.id, handoffCode, state: row.state };
}

const service = new DesktopAuthService();

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "desktop_auth_transaction", "desktop_session" CASCADE'
  );
});

afterEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "desktop_auth_transaction", "desktop_session" CASCADE'
  );
});

async function expectRemaining(ids: string[]) {
  expect(await db.desktop_auth_transaction.count()).toBe(ids.length);
  for (const id of ids) {
    await expect(
      db.desktop_auth_transaction.findUniqueOrThrow({ where: { id } })
    ).resolves.toMatchObject({ id });
  }
}

async function expectRemoved(id: string) {
  expect(await db.desktop_auth_transaction.findUnique({ where: { id } })).toBeNull();
}

describe('desktop transaction cleanup (real database)', () => {
  it('deletes expired pending transactions and keeps valid ones', async () => {
    const expired = await seedTransaction({ status: 'pending', expiresAt: minutesAgo(1) });
    const valid = await seedTransaction({ status: 'pending' });

    expect(await service.cleanupExpiredTransactions()).toBe(1);
    await expectRemaining([valid.id]);
    await expectRemoved(expired.id);
  });

  it('deletes expired processing transactions and keeps valid ones', async () => {
    const expired = await seedTransaction({ status: 'processing', expiresAt: minutesAgo(2) });
    const valid = await seedTransaction({ status: 'processing' });

    expect(await service.cleanupExpiredTransactions()).toBe(1);
    await expectRemaining([valid.id]);
    await expectRemoved(expired.id);
  });

  it('deletes authenticated transactions only after handoff expiry', async () => {
    const expired = await seedTransaction({
      status: 'authenticated',
      handoffExpiresAt: minutesAgo(1),
    });
    const valid = await seedTransaction({ status: 'authenticated' });

    expect(await service.cleanupExpiredTransactions()).toBe(1);
    await expectRemaining([valid.id]);
    await expectRemoved(expired.id);
  });

  it('retains failed transactions for the debugging window and deletes older ones', async () => {
    const recent = await seedTransaction({ status: 'failed', consumedAt: minutesAgo(30) });
    const old = await seedTransaction({ status: 'failed', consumedAt: minutesAgo(90) });

    expect(await service.cleanupExpiredTransactions()).toBe(1);
    await expectRemaining([recent.id]);
    await expectRemoved(old.id);
  });

  it('cleans up leftover consumed transactions after the retention window', async () => {
    const recent = await seedTransaction({
      status: 'consumed',
      consumedAt: minutesAgo(30),
      handoffConsumedAt: minutesAgo(30),
    });
    const old = await seedTransaction({
      status: 'consumed',
      consumedAt: minutesAgo(90),
      handoffConsumedAt: minutesAgo(90),
    });

    expect(await service.cleanupExpiredTransactions()).toBe(1);
    await expectRemaining([recent.id]);
    await expectRemoved(old.id);
  });

  it('preserves every valid transaction and is safe to repeat', async () => {
    const validPending = await seedTransaction({ status: 'pending' });
    const validProcessing = await seedTransaction({ status: 'processing' });
    const validAuthenticated = await seedTransaction({ status: 'authenticated' });
    const recentFailed = await seedTransaction({ status: 'failed', consumedAt: minutesAgo(10) });

    expect(await service.cleanupExpiredTransactions()).toBe(0);
    expect(await service.cleanupExpiredTransactions()).toBe(0);
    await expectRemaining([
      validPending.id,
      validProcessing.id,
      validAuthenticated.id,
      recentFailed.id,
    ]);
  });

  it('does not disturb an authenticated handoff that is still redeemable', async () => {
    const { id, handoffCode } = await seedTransaction({ status: 'authenticated' });

    await service.cleanupExpiredTransactions();

    const response = await request(app)
      .post('/api/auth/desktop/exchange')
      .send({ code: handoffCode, codeVerifier: CODE_VERIFIER })
      .expect(200);
    const body = response.body as { user: { id: string } };
    expect(body.user).toMatchObject({ id: USER_ID });
    expect(await db.desktop_session.count()).toBe(1);
    expect(await db.desktop_auth_transaction.count({ where: { id } })).toBe(0);
  });
});
