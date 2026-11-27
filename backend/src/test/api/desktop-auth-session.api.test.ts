import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../app';
import { AuthRepository } from '../../module/auth-module/auth.repository';
import { DesktopAuthService } from '../../module/auth-module/desktop-auth.service';
import { db } from './helpers/db';

/**
 * A desktop session must survive service reconstruction (an app restart) and
 * remain revocable through both the access and refresh token paths.
 */
const CODE_VERIFIER = 'a'.repeat(43);
const CODE_CHALLENGE = createHash('sha256').update(CODE_VERIFIER).digest('base64url');
const USER_ID = '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11';
const USER_EMAIL = 'trainee@vonnue.com';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const authRepository = {
  findById: vi.fn(),
  findActiveStaffById: vi.fn(),
} as unknown as AuthRepository;

const restartedService = () => new DesktopAuthService(undefined, authRepository);

async function seedHandoff() {
  const handoffCode = randomBytes(32).toString('base64url');
  const now = Date.now();
  await db.desktop_auth_transaction.create({
    data: {
      id: randomUUID(),
      state: randomBytes(24).toString('base64url'),
      code_challenge: CODE_CHALLENGE,
      code_challenge_method: 'S256',
      loopback_redirect_uri: 'http://127.0.0.1:55555/callback',
      status: 'authenticated',
      user_id: USER_ID,
      user_email: USER_EMAIL,
      user_name: 'Test Trainee',
      user_role: 'trainee',
      error_code: null,
      handoff_code_hash: sha256(handoffCode),
      handoff_expires_at: new Date(now + 60_000),
      handoff_consumed_at: null,
      expires_at: new Date(now + 5 * 60_000),
      consumed_at: null,
      created_at: new Date(now),
    },
  });
  return handoffCode;
}

type Session = {
  accessToken: string;
  refreshToken: string;
};

async function exchange(): Promise<Session> {
  const code = await seedHandoff();
  const response = await request(app)
    .post('/api/auth/desktop/exchange')
    .send({ code, codeVerifier: CODE_VERIFIER })
    .expect(200);
  return response.body as Session;
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "desktop_auth_transaction", "desktop_session" CASCADE'
  );
  vi.mocked(authRepository.findById).mockReset();
  vi.mocked(authRepository.findById).mockResolvedValue({ id: USER_ID, is_active: true } as never);
  vi.mocked(authRepository.findActiveStaffById).mockReset();
});

afterEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "desktop_auth_transaction", "desktop_session" CASCADE'
  );
});

describe('desktop session integrity', () => {
  it('restores the user from an access token in a fresh service instance', async () => {
    const { accessToken } = await exchange();

    await expect(restartedService().getSession(accessToken)).resolves.toEqual({
      user: { id: USER_ID, email: USER_EMAIL, name: 'Test Trainee', role: 'trainee' },
    });
  });

  it('refreshes tokens in a fresh service instance and rejects the old token', async () => {
    const { refreshToken } = await exchange();

    const refreshed = await restartedService().refresh(refreshToken);
    expect(refreshed.refreshToken).not.toBe(refreshToken);
    await expect(restartedService().getSession(refreshed.accessToken)).resolves.toMatchObject({
      user: { id: USER_ID },
    });
    await expect(restartedService().refresh(refreshToken)).rejects.toMatchObject({
      code: 'DESKTOP_SESSION_REVOKED',
    });
  });

  it('revokes both tokens on logout in a fresh service instance', async () => {
    const { accessToken, refreshToken } = await exchange();

    await restartedService().logout({ accessToken, refreshToken });

    await expect(restartedService().getSession(accessToken)).rejects.toMatchObject({
      code: 'DESKTOP_SESSION_REVOKED',
    });
    await expect(restartedService().refresh(refreshToken)).rejects.toMatchObject({
      code: 'DESKTOP_SESSION_REVOKED',
    });
  });
});
