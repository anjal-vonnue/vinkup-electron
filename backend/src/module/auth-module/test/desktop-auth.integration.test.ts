import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../../app';
import { verifyDesktopAccessToken } from '../../../utils/jwt';

type Trainee = {
  id: string;
  email: string;
  name: string;
  role: 'trainee';
};

type Admin = {
  id: string;
  email: string;
  name: string;
  role: 'admin';
};

const trainee: Trainee = {
  id: '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11',
  email: 'trainee@vonnue.com',
  name: 'Test Trainee',
  role: 'trainee',
};
const admin: Admin = {
  id: '9b1e4c2a-7d3f-4e8b-a1c5-2f6d8e0b4a77',
  email: 'mentor@vonnue.com',
  name: 'Test Mentor',
  role: 'admin',
};

/**
 * An in-memory stand-in for the Prisma repository. The semantics of the
 * conditional updates (status/expiry checks) mirror the real queries, so the
 * service's one-time and replay protections are exercised without a database.
 */
const store = vi.hoisted(() => {
  type Snapshot = { id: string; email: string; name: string; role: 'trainee' | 'admin' };
  type Transaction = {
    id: string;
    state: string;
    code_challenge: string;
    code_challenge_method: string;
    loopback_redirect_uri: string;
    status: string;
    user_id: string | null;
    user_email: string | null;
    user_name: string | null;
    user_role: string | null;
    error_code: string | null;
    handoff_code_hash: string | null;
    handoff_expires_at: Date | null;
    handoff_consumed_at: Date | null;
    expires_at: Date;
    consumed_at: Date | null;
    created_at: Date;
  };
  type Session = {
    id: string;
    user_id: string;
    user_email: string;
    user_name: string;
    user_role: string;
    refresh_token_hash: string;
    expires_at: Date;
    last_used_at: Date;
    revoked_at: Date | null;
    created_at: Date;
  };

  const transactions = new Map<string, Transaction>();
  const sessions = new Map<string, Session>();
  let sequence = 0;
  const nextId = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
  const count = (matched: boolean) => ({ count: matched ? 1 : 0 });

  class InMemoryDesktopAuthRepository {
    createTransaction = (data: {
      state: string;
      codeChallenge: string;
      codeChallengeMethod: string;
      loopbackRedirectUri: string;
      expiresAt: Date;
    }) => {
      const row: Transaction = {
        id: nextId(),
        state: data.state,
        code_challenge: data.codeChallenge,
        code_challenge_method: data.codeChallengeMethod,
        loopback_redirect_uri: data.loopbackRedirectUri,
        status: 'pending',
        user_id: null,
        user_email: null,
        user_name: null,
        user_role: null,
        error_code: null,
        handoff_code_hash: null,
        handoff_expires_at: null,
        handoff_consumed_at: null,
        expires_at: data.expiresAt,
        consumed_at: null,
        created_at: new Date(),
      };
      transactions.set(row.id, row);
      return row;
    };

    findPendingTransactionById = (id: string, now: Date) => {
      const row = transactions.get(id);
      return row && row.status === 'pending' && row.expires_at > now ? row : null;
    };

    findTransactionByState = (state: string) =>
      [...transactions.values()].find((row) => row.state === state) ?? null;

    claimTransaction = (id: string, now: Date) => {
      const row = transactions.get(id);
      const matched = Boolean(row && row.status === 'pending' && row.expires_at > now);
      if (matched && row) row.status = 'processing';
      return count(matched);
    };

    completeTransaction = (
      id: string,
      user: Snapshot,
      handoffCodeHash: string,
      handoffExpiresAt: Date,
      now: Date
    ) => {
      const row = transactions.get(id);
      const matched = Boolean(row && row.status === 'processing');
      if (matched && row) {
        row.status = 'authenticated';
        row.user_id = user.id;
        row.user_email = user.email;
        row.user_name = user.name;
        row.user_role = user.role;
        row.handoff_code_hash = handoffCodeHash;
        row.handoff_expires_at = handoffExpiresAt;
        row.consumed_at = now;
      }
      return count(matched);
    };

    failTransaction = (id: string, errorCode: string, now: Date) => {
      const row = transactions.get(id);
      const matched = Boolean(row && (row.status === 'pending' || row.status === 'processing'));
      if (matched && row) {
        row.status = 'failed';
        row.error_code = errorCode;
        row.consumed_at = now;
      }
      return count(matched);
    };

    findTransactionByHandoffHash = (handoffCodeHash: string) =>
      [...transactions.values()].find((row) => row.handoff_code_hash === handoffCodeHash) ?? null;

    consumeHandoff = (id: string, now: Date) => {
      const row = transactions.get(id);
      const matched = Boolean(
        row &&
        row.status === 'authenticated' &&
        row.handoff_consumed_at === null &&
        row.handoff_expires_at &&
        row.handoff_expires_at > now
      );
      if (matched && row) {
        row.status = 'consumed';
        row.handoff_consumed_at = now;
        row.consumed_at = now;
      }
      return count(matched);
    };

    createSession = (data: {
      id: string;
      user: Snapshot;
      refreshTokenHash: string;
      expiresAt: Date;
      now: Date;
    }) => {
      const row: Session = {
        id: data.id,
        user_id: data.user.id,
        user_email: data.user.email,
        user_name: data.user.name,
        user_role: data.user.role,
        refresh_token_hash: data.refreshTokenHash,
        expires_at: data.expiresAt,
        last_used_at: data.now,
        revoked_at: null,
        created_at: data.now,
      };
      sessions.set(row.id, row);
      return row;
    };

    findSessionByTokenHash = (refreshTokenHash: string) =>
      [...sessions.values()].find((row) => row.refresh_token_hash === refreshTokenHash) ?? null;

    findSessionById = (id: string) => sessions.get(id) ?? null;

    rotateSessionToken = (
      id: string,
      oldRefreshTokenHash: string,
      newRefreshTokenHash: string,
      expiresAt: Date,
      now: Date
    ) => {
      const row = sessions.get(id);
      const matched = Boolean(
        row &&
        row.refresh_token_hash === oldRefreshTokenHash &&
        row.revoked_at === null &&
        row.expires_at > now
      );
      if (matched && row) {
        row.refresh_token_hash = newRefreshTokenHash;
        row.expires_at = expiresAt;
        row.last_used_at = now;
      }
      return count(matched);
    };

    revokeSessionByTokenHash = (refreshTokenHash: string, now: Date) => {
      const row = [...sessions.values()].find(
        (candidate) =>
          candidate.refresh_token_hash === refreshTokenHash && candidate.revoked_at === null
      );
      if (row) row.revoked_at = now;
      return count(Boolean(row));
    };

    revokeSessionById = (id: string, now: Date) => {
      const row = sessions.get(id);
      const matched = Boolean(row && row.revoked_at === null);
      if (matched && row) row.revoked_at = now;
      return count(matched);
    };
  }

  return {
    transactions,
    sessions,
    InMemoryDesktopAuthRepository,
    reset: () => {
      transactions.clear();
      sessions.clear();
    },
  };
});

const authLookups = vi.hoisted(() => ({
  findBymail: vi.fn(),
  findById: vi.fn(),
  findActiveAdminByEmail: vi.fn(),
  findActiveAdminById: vi.fn(),
  recordAdminLogin: vi.fn(),
}));

vi.mock('../desktop-auth.repository', () => ({
  DesktopAuthRepository: store.InMemoryDesktopAuthRepository,
}));

vi.mock('../auth.repository', () => ({
  AuthRepository: class {
    findBymail = authLookups.findBymail;
    findById = authLookups.findById;
    findActiveAdminByEmail = authLookups.findActiveAdminByEmail;
    findActiveAdminById = authLookups.findActiveAdminById;
    recordAdminLogin = authLookups.recordAdminLogin;
  },
}));

// Google's consent screen is not automatable in CI. The fake strategy mirrors
// Passport's contract: authorization redirect without `code`, profile verify
// with `code`. The real passport.ts verify callback and the real service run.
vi.mock('passport-google-oauth20', () => {
  type Done = (error: unknown, user?: unknown, info?: unknown) => void;
  type Verify = (accessToken: string, refreshToken: string, profile: unknown, done: Done) => void;
  interface PassportActions {
    success(user: unknown, info?: unknown): void;
    fail(info?: unknown, status?: number): void;
    error(err: unknown): void;
    redirect(url: string, status?: number): void;
  }

  class Strategy {
    name = 'google';
    private readonly verify: Verify;

    constructor(_options: unknown, verify: Verify) {
      this.verify = verify;
    }

    authenticate(
      this: Strategy & PassportActions,
      req: { query: Record<string, string | undefined> },
      options: { scope?: string[]; state?: string } = {}
    ): void {
      if (!req.query.code) {
        const scope = encodeURIComponent((options.scope ?? []).join(' '));
        const state = encodeURIComponent(options.state ?? '');
        this.redirect(`https://accounts.google.com/o/oauth2/v2/auth?scope=${scope}&state=${state}`);
        return;
      }

      const email = req.query.email;
      const profile = {
        id: 'google-id-1',
        provider: 'google',
        displayName: 'Test User',
        emails: email ? [{ value: email, verified: true }] : undefined,
      };

      this.verify('access-token', 'refresh-token', profile, (error, user, info) => {
        if (error) this.error(error);
        else if (!user) this.fail(info, 401);
        else this.success(user, info);
      });
    }
  }

  return { Strategy };
});

const BASE = '/api/auth/desktop';
const REDIRECT_URI = 'http://127.0.0.1:55555/callback';
const CODE_VERIFIER = 'a'.repeat(43);
const CODE_CHALLENGE = createHash('sha256').update(CODE_VERIFIER).digest('base64url');

function createTransaction(overrides: Record<string, unknown> = {}) {
  return request(app)
    .post(`${BASE}/transactions`)
    .send({
      redirectUri: REDIRECT_URI,
      codeChallenge: CODE_CHALLENGE,
      codeChallengeMethod: 'S256',
      ...overrides,
    });
}

async function beginLogin(email = trainee.email) {
  const transactionResponse = await createTransaction().expect(201);
  const transaction = transactionResponse.body as {
    transactionId: string;
    state: string;
    authorizationUrl: string;
    expiresAt: string;
  };

  const callback = await request(app)
    .get(`${BASE}/callback`)
    .query({ code: 'fake-google-code', state: transaction.state, email })
    .expect(302);

  const redirect = new URL(callback.headers.location);
  return { transaction, callback, redirect };
}

function handoffCode(redirect: URL): string {
  const code = redirect.searchParams.get('code');
  expect(code).toBeTruthy();
  return code as string;
}

beforeEach(() => {
  store.reset();
  vi.clearAllMocks();
  authLookups.findBymail.mockReset();
  authLookups.findById.mockReset();
  authLookups.findActiveAdminByEmail.mockReset();
  authLookups.findActiveAdminById.mockReset();
  authLookups.recordAdminLogin.mockReset();

  authLookups.findBymail.mockResolvedValue(trainee);
  authLookups.findById.mockResolvedValue(trainee);
  authLookups.findActiveAdminByEmail.mockResolvedValue(null);
  authLookups.findActiveAdminById.mockResolvedValue(admin);
  authLookups.recordAdminLogin.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/auth/desktop/transactions', () => {
  it('creates a one-time transaction for a loopback redirect', async () => {
    const response = await createTransaction().expect(201);
    const body = response.body as {
      transactionId: string;
      state: string;
      authorizationUrl: string;
      expiresAt: string;
    };
    expect(body.state).toEqual(expect.any(String));
    expect(body.authorizationUrl).toContain('/api/auth/desktop/google?transaction=');
    expect(body.expiresAt).toEqual(expect.any(String));
    expect(body.transactionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it.each([
    ['a non-loopback host', 'http://localhost:55555/callback'],
    ['HTTPS', 'https://127.0.0.1:55555/callback'],
    ['a missing port', 'http://127.0.0.1/callback'],
    ['a query string', 'http://127.0.0.1:55555/callback?next=evil'],
  ])('rejects %s', async (_label, redirectUri) => {
    const response = await createTransaction({ redirectUri });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  it('rejects an invalid PKCE challenge', async () => {
    await createTransaction({ codeChallenge: 'too-short' }).expect(400);
  });
});

describe('GET /api/auth/desktop/google', () => {
  it('starts the Google consent screen with the transaction state', async () => {
    const transaction = (await createTransaction().expect(201)).body as {
      transactionId: string;
      state: string;
    };

    const response = await request(app)
      .get(`${BASE}/google`)
      .query({ transaction: transaction.transactionId })
      .expect(302);

    const location = new URL(response.headers.location);
    expect(location.hostname).toBe('accounts.google.com');
    expect(location.searchParams.get('scope')).toBe('profile email');
    expect(location.searchParams.get('state')).toBe(transaction.state);
  });

  it('rejects an unknown transaction', async () => {
    await request(app)
      .get(`${BASE}/google`)
      .query({ transaction: '00000000-0000-4000-8000-000000000099' })
      .expect(400);
  });
});

describe('GET /api/auth/desktop/callback', () => {
  it('redirects to the loopback with a one-time code and no tokens', async () => {
    const { redirect, transaction } = await beginLogin();

    expect(redirect.origin).toBe('http://127.0.0.1:55555');
    expect(redirect.pathname).toBe('/callback');
    expect(redirect.searchParams.get('state')).toBe(transaction.state);
    expect(handoffCode(redirect)).toMatch(/^[A-Za-z0-9_-]{40,}$/);

    const raw = redirect.toString().toLowerCase();
    expect(raw).not.toContain('accesstoken');
    expect(raw).not.toContain('refreshtoken');
    expect(raw).not.toContain('jwt');
  });

  it('rejects an unknown state', async () => {
    const response = await request(app)
      .get(`${BASE}/callback`)
      .query({ code: 'fake-code', state: 'not-a-real-state' });
    expect(response.status).toBe(400);
    expect(response.text).not.toContain('access');
  });

  it('redirects a Google cancellation back to the loopback', async () => {
    const transaction = (await createTransaction().expect(201)).body as { state: string };

    const response = await request(app)
      .get(`${BASE}/callback`)
      .query({ error: 'access_denied', state: transaction.state })
      .expect(302);

    const location = new URL(response.headers.location);
    expect(location.searchParams.get('error')).toBe('DESKTOP_AUTH_CANCELLED');
    expect(location.searchParams.get('code')).toBeNull();
  });

  it('redirects a non-company Google account with DOMAIN_NOT_PERMITTED', async () => {
    const { redirect } = await beginLogin('someone@gmail.com');
    expect(redirect.searchParams.get('error')).toBe('DOMAIN_NOT_PERMITTED');
    expect(redirect.searchParams.get('code')).toBeNull();
  });

  it('rejects an expired transaction', async () => {
    const transaction = (await createTransaction().expect(201)).body as {
      transactionId: string;
      state: string;
    };
    const row = store.transactions.get(transaction.transactionId);
    expect(row).toBeTruthy();
    if (row) row.expires_at = new Date(Date.now() - 1_000);

    const response = await request(app)
      .get(`${BASE}/callback`)
      .query({ code: 'fake-code', state: transaction.state });
    expect(response.status).toBe(400);
  });

  it('does not claim a completed transaction twice', async () => {
    const { transaction } = await beginLogin();

    const second = await request(app)
      .get(`${BASE}/callback`)
      .query({ code: 'fake-code', state: transaction.state });
    expect(second.status).toBe(400);
  });
});

describe('POST /api/auth/desktop/exchange', () => {
  it('releases tokens only with the matching PKCE verifier', async () => {
    const { redirect } = await beginLogin();

    const response = await request(app)
      .post(`${BASE}/exchange`)
      .send({ code: handoffCode(redirect), codeVerifier: CODE_VERIFIER })
      .expect(200);

    const session = response.body as {
      accessToken: string;
      refreshToken: string;
      accessTokenExpiresAt: string;
      refreshTokenExpiresAt: string;
      user: Record<string, unknown>;
    };
    expect(session.user).toEqual(trainee);
    expect(session.refreshToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(new Date(session.accessTokenExpiresAt).getTime()).toBeGreaterThan(Date.now());

    const payload = verifyDesktopAccessToken(session.accessToken);
    expect(payload).toMatchObject({
      id: trainee.id,
      email: trainee.email,
      role: 'trainee',
      typ: 'desktop',
    });
    expect(payload.sid).toBeTruthy();
  });

  it('rejects a wrong PKCE verifier without consuming the code', async () => {
    const { redirect } = await beginLogin();

    const response = await request(app)
      .post(`${BASE}/exchange`)
      .send({ code: handoffCode(redirect), codeVerifier: 'b'.repeat(43) })
      .expect(400);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'DESKTOP_AUTH_INVALID_PKCE'
    );

    // The legitimate verifier still works.
    await request(app)
      .post(`${BASE}/exchange`)
      .send({ code: handoffCode(redirect), codeVerifier: CODE_VERIFIER })
      .expect(200);
  });

  it('rejects an unknown code', async () => {
    const response = await request(app)
      .post(`${BASE}/exchange`)
      .send({ code: 'x'.repeat(43), codeVerifier: CODE_VERIFIER })
      .expect(400);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'DESKTOP_AUTH_INVALID_CODE'
    );
  });

  it('rejects a replayed handoff code', async () => {
    const { redirect } = await beginLogin();
    const body = { code: handoffCode(redirect), codeVerifier: CODE_VERIFIER };

    await request(app).post(`${BASE}/exchange`).send(body).expect(200);
    const replay = await request(app).post(`${BASE}/exchange`).send(body).expect(409);
    expect((replay.body as { error: { code: string } }).error.code).toBe('DESKTOP_AUTH_CODE_USED');
  });

  it('rejects an expired handoff code', async () => {
    const { redirect, transaction } = await beginLogin();
    const row = [...store.transactions.values()].find(
      (candidate) =>
        candidate.user_email === trainee.email && candidate.id === transaction.transactionId
    );
    if (!row) throw new Error('transaction not found');
    row.handoff_expires_at = new Date(Date.now() - 1_000);

    const response = await request(app)
      .post(`${BASE}/exchange`)
      .send({ code: handoffCode(redirect), codeVerifier: CODE_VERIFIER })
      .expect(400);
    expect((response.body as { error: { code: string } }).error.code).toBe('DESKTOP_AUTH_EXPIRED');
  });

  it('signs in an admin and returns the admin role', async () => {
    authLookups.findActiveAdminByEmail.mockResolvedValue(admin);
    const { redirect } = await beginLogin(admin.email);

    const response = await request(app)
      .post(`${BASE}/exchange`)
      .send({ code: handoffCode(redirect), codeVerifier: CODE_VERIFIER })
      .expect(200);
    expect((response.body as { user: unknown }).user).toEqual(admin);
    expect(authLookups.recordAdminLogin).toHaveBeenCalledWith(admin.id);
  });
});

describe('GET /api/auth/desktop/session', () => {
  it('returns the user for a desktop bearer token', async () => {
    const { redirect } = await beginLogin();
    const exchange = await request(app)
      .post(`${BASE}/exchange`)
      .send({ code: handoffCode(redirect), codeVerifier: CODE_VERIFIER })
      .expect(200);
    const { accessToken } = exchange.body as { accessToken: string };

    const response = await request(app)
      .get(`${BASE}/session`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(response.body).toEqual({ user: trainee });
  });

  it('does not accept a web cookie instead of a bearer token', async () => {
    await request(app).get(`${BASE}/session`).expect(401);
  });
});

describe('POST /api/auth/desktop/refresh', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    const { redirect } = await beginLogin();
    const first = await request(app)
      .post(`${BASE}/exchange`)
      .send({ code: handoffCode(redirect), codeVerifier: CODE_VERIFIER })
      .expect(200);
    const firstBody = first.body as { accessToken: string; refreshToken: string };

    const refreshed = await request(app)
      .post(`${BASE}/refresh`)
      .send({ refreshToken: firstBody.refreshToken })
      .expect(200);
    const refreshedBody = refreshed.body as { accessToken: string; refreshToken: string };

    expect(refreshedBody.refreshToken).not.toBe(firstBody.refreshToken);
    expect(verifyDesktopAccessToken(refreshedBody.accessToken).sid).toBe(
      verifyDesktopAccessToken(firstBody.accessToken).sid
    );

    await request(app)
      .post(`${BASE}/refresh`)
      .send({ refreshToken: firstBody.refreshToken })
      .expect(401);

    await request(app)
      .post(`${BASE}/refresh`)
      .send({ refreshToken: refreshedBody.refreshToken })
      .expect(200);
  });

  it('rejects an unknown refresh token', async () => {
    await request(app)
      .post(`${BASE}/refresh`)
      .send({ refreshToken: 'z'.repeat(43) })
      .expect(401);
  });
});

describe('POST /api/auth/desktop/logout', () => {
  it('revokes both the refresh token and the access session', async () => {
    const { redirect } = await beginLogin();
    const session = await request(app)
      .post(`${BASE}/exchange`)
      .send({ code: handoffCode(redirect), codeVerifier: CODE_VERIFIER })
      .expect(200);
    const { accessToken, refreshToken } = session.body as {
      accessToken: string;
      refreshToken: string;
    };

    await request(app)
      .post(`${BASE}/logout`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(204);

    await request(app)
      .get(`${BASE}/session`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    await request(app).post(`${BASE}/refresh`).send({ refreshToken }).expect(401);
  });

  it('accepts an empty body so logout always succeeds', async () => {
    await request(app).post(`${BASE}/logout`).send({}).expect(204);
  });
});

describe('web authentication regression', () => {
  it('keeps the existing /api/auth/google redirect untouched', async () => {
    const response = await request(app).get('/api/auth/google').expect(302);
    const location = new URL(response.headers.location);
    expect(location.hostname).toBe('accounts.google.com');
    expect(location.searchParams.get('scope')).toBe('profile email');
  });
});
