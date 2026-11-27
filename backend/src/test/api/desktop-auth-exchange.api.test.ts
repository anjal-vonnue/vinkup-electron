import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { db } from './helpers/db';

/**
 * Real-database coverage for the handoff exchange. Unlike the mocked suite,
 * these tests exercise Prisma's actual `$transaction` rollback semantics.
 */
const BASE = '/api/auth/desktop/exchange';
const CODE_VERIFIER = 'a'.repeat(43);
const CODE_CHALLENGE = createHash('sha256').update(CODE_VERIFIER).digest('base64url');
const REDIRECT_URI = 'http://127.0.0.1:55555/callback';
const USER_ID = '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11';
const USER_EMAIL = 'trainee@vonnue.com';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

type SeedOverrides = {
  status?: string;
  userEmail?: string;
  codeChallenge?: string;
  handoffExpiresAt?: Date;
  handoffConsumedAt?: Date;
};

async function seedTransaction(overrides: SeedOverrides = {}) {
  const handoffCode = randomBytes(32).toString('base64url');
  const now = Date.now();
  const row = await db.desktop_auth_transaction.create({
    data: {
      id: randomUUID(),
      state: randomBytes(24).toString('base64url'),
      code_challenge: overrides.codeChallenge ?? CODE_CHALLENGE,
      code_challenge_method: 'S256',
      loopback_redirect_uri: REDIRECT_URI,
      status: overrides.status ?? 'authenticated',
      user_id: USER_ID,
      user_email: overrides.userEmail ?? USER_EMAIL,
      user_name: 'Test Trainee',
      user_role: 'trainee',
      error_code: null,
      handoff_code_hash: sha256(handoffCode),
      handoff_expires_at: overrides.handoffExpiresAt ?? new Date(now + 60_000),
      handoff_consumed_at: overrides.handoffConsumedAt ?? null,
      expires_at: new Date(now + 5 * 60_000),
      consumed_at: null,
      created_at: new Date(now),
    },
  });
  return { id: row.id, handoffCode };
}

const exchangeBody = (code: string, verifier = CODE_VERIFIER) => ({
  code,
  codeVerifier: verifier,
});

type ExchangeResponse = {
  user?: { id: string; email: string };
  refreshToken?: string;
  error?: { code: string };
};

const bodyOf = (response: { body: unknown }): ExchangeResponse => response.body as ExchangeResponse;

async function installFailureTrigger(table: 'desktop_session' | 'desktop_auth_transaction') {
  await db.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION desktop_auth_test_raise() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'simulated database failure';
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  const event = table === 'desktop_session' ? 'INSERT' : 'DELETE';
  const alias = table === 'desktop_session' ? 'NEW' : 'OLD';
  const marker = table === 'desktop_session' ? 'fail-session@vonnue.com' : 'fail-delete@vonnue.com';
  await db.$executeRawUnsafe(`
    CREATE TRIGGER desktop_auth_test_failure BEFORE ${event} ON ${table}
    FOR EACH ROW WHEN (${alias}.user_email = '${marker}')
    EXECUTE FUNCTION desktop_auth_test_raise()
  `);
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "desktop_auth_transaction", "desktop_session" CASCADE'
  );
});

afterEach(async () => {
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS desktop_auth_test_failure ON desktop_session');
  await db.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS desktop_auth_test_failure ON desktop_auth_transaction'
  );
  await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS desktop_auth_test_raise()');
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "desktop_auth_transaction", "desktop_session" CASCADE'
  );
});

describe('POST /api/auth/desktop/exchange (real database)', () => {
  it('creates a desktop session and deletes the transaction', async () => {
    const { id, handoffCode } = await seedTransaction();

    const response = await request(app).post(BASE).send(exchangeBody(handoffCode)).expect(200);

    expect(bodyOf(response).user).toMatchObject({ id: USER_ID, email: USER_EMAIL });
    expect(bodyOf(response).refreshToken).toEqual(expect.any(String));
    expect(await db.desktop_session.count()).toBe(1);
    expect(await db.desktop_auth_transaction.count({ where: { id } })).toBe(0);
  });

  it('rejects an unknown handoff code and preserves unrelated transactions', async () => {
    const { id } = await seedTransaction();

    const response = await request(app)
      .post(BASE)
      .send(exchangeBody('x'.repeat(43)))
      .expect(400);

    expect(bodyOf(response).error?.code).toBe('DESKTOP_AUTH_INVALID_CODE');
    expect(await db.desktop_session.count()).toBe(0);
    expect(await db.desktop_auth_transaction.count({ where: { id } })).toBe(1);
  });

  it('rejects an invalid PKCE verifier without consuming the handoff', async () => {
    const { id, handoffCode } = await seedTransaction();

    const response = await request(app)
      .post(BASE)
      .send(exchangeBody(handoffCode, 'b'.repeat(43)))
      .expect(400);

    expect(bodyOf(response).error?.code).toBe('DESKTOP_AUTH_INVALID_PKCE');
    const transaction = await db.desktop_auth_transaction.findUniqueOrThrow({ where: { id } });
    expect(transaction.status).toBe('authenticated');
    expect(transaction.handoff_consumed_at).toBeNull();
  });

  it('rejects an expired handoff code', async () => {
    const { id, handoffCode } = await seedTransaction({
      handoffExpiresAt: new Date(Date.now() - 1_000),
    });

    const response = await request(app).post(BASE).send(exchangeBody(handoffCode)).expect(400);

    expect(bodyOf(response).error?.code).toBe('DESKTOP_AUTH_EXPIRED');
    expect(await db.desktop_session.count()).toBe(0);
    expect(await db.desktop_auth_transaction.count({ where: { id } })).toBe(1);
  });

  it.each(['pending', 'processing', 'failed', 'consumed'])(
    'rejects a transaction in %s status',
    async (status) => {
      const { handoffCode } = await seedTransaction({ status });
      const expectedStatus = status === 'consumed' ? 409 : 400;
      const expectedCode =
        status === 'consumed' ? 'DESKTOP_AUTH_CODE_USED' : 'DESKTOP_AUTH_INVALID_CODE';

      const response = await request(app)
        .post(BASE)
        .send(exchangeBody(handoffCode))
        .expect(expectedStatus);

      expect(bodyOf(response).error?.code).toBe(expectedCode);
      expect(await db.desktop_session.count()).toBe(0);
    }
  );

  it('lets only one of two concurrent exchanges succeed', async () => {
    const { id, handoffCode } = await seedTransaction();
    const body = exchangeBody(handoffCode);

    const responses = await Promise.all([
      request(app).post(BASE).send(body),
      request(app).post(BASE).send(body),
    ]);
    const statuses = responses.map((response) => response.status).sort((a, b) => a - b);

    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);
    expect(await db.desktop_session.count()).toBe(1);
    expect(await db.desktop_auth_transaction.count({ where: { id } })).toBe(0);
  });

  it('rolls back consumption and deletion when session creation fails', async () => {
    const { id, handoffCode } = await seedTransaction({ userEmail: 'fail-session@vonnue.com' });
    await installFailureTrigger('desktop_session');

    const failed = await request(app).post(BASE).send(exchangeBody(handoffCode));
    expect(failed.status).toBe(500);

    const transaction = await db.desktop_auth_transaction.findUniqueOrThrow({ where: { id } });
    expect(transaction.status).toBe('authenticated');
    expect(transaction.handoff_consumed_at).toBeNull();
    expect(await db.desktop_session.count()).toBe(0);
  });

  it('rolls back session creation and consumption when deletion fails', async () => {
    const { id, handoffCode } = await seedTransaction({ userEmail: 'fail-delete@vonnue.com' });
    await installFailureTrigger('desktop_auth_transaction');

    const failed = await request(app).post(BASE).send(exchangeBody(handoffCode));
    expect(failed.status).toBe(500);

    const transaction = await db.desktop_auth_transaction.findUniqueOrThrow({ where: { id } });
    expect(transaction.status).toBe('authenticated');
    expect(transaction.handoff_consumed_at).toBeNull();
    expect(await db.desktop_session.count()).toBe(0);
  });
});
