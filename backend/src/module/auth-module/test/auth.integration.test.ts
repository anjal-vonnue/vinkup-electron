import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import app from '../../../app';
import { env } from '../../../config/env';
import { signJwt, verifyJwt } from '../../../utils/jwt';
import { AUTH_COOKIE_NAME } from '../auth.constants';

const { findBymail, findActiveAdminByEmail, findActiveAdminById, recordAdminLogin } = vi.hoisted(
  () => ({
    findBymail: vi.fn(),
    findActiveAdminByEmail: vi.fn(),
    findActiveAdminById: vi.fn(),
    recordAdminLogin: vi.fn(),
  })
);

vi.mock('../auth.repository', () => ({
  AuthRepository: class {
    findBymail = findBymail;
    findById = vi.fn();
    findActiveAdminByEmail = findActiveAdminByEmail;
    findActiveAdminById = findActiveAdminById;
    recordAdminLogin = recordAdminLogin;
  },
}));

// Google's consent screen and token exchange can't be automated, so the strategy
// class is swapped for a fake that behaves like the real one from Passport's view:
//   - no `code` query param  -> redirect to Google (first leg)
//   - `code` present         -> build a profile from the query and call the REAL
//                               verify callback from passport.ts (second leg)
vi.mock('passport-google-oauth20', () => {
  type Done = (error: unknown, user?: unknown, info?: unknown) => void;
  type Verify = (accessToken: string, refreshToken: string, profile: unknown, done: Done) => void;

  // Methods Passport attaches to the strategy instance at request time
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
      options: { scope?: string[] } = {}
    ): void {
      if (!req.query.code) {
        const scope = encodeURIComponent((options.scope ?? []).join(' '));
        this.redirect(`https://accounts.google.com/o/oauth2/v2/auth?scope=${scope}`);
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
        if (error) {
          this.error(error);
        } else if (!user) {
          this.fail(info, 401);
        } else {
          this.success(user, info);
        }
      });
    }
  }

  return { Strategy };
});

type Res = request.Response;

const BASE = '/api/auth';

const trainee = {
  id: '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11',
  email: `trainee@${env.ALLOWED_EMAIL_DOMAIN}`,
  name: 'Test Trainee',
};

const admin = {
  id: '9b1e4c2a-7d3f-4e8b-a1c5-2f6d8e0b4a77',
  email: `mentor@${env.ALLOWED_EMAIL_DOMAIN}`,
  name: 'Test Mentor',
};

function callbackUrl(params: Record<string, string> = {}): string {
  return `${BASE}/google/callback?${new URLSearchParams({ code: 'fake-code', ...params }).toString()}`;
}

function getAuthCookie(res: Res): string | undefined {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  return (header ?? []).find((cookie) => cookie.startsWith(`${AUTH_COOKIE_NAME}=`));
}

function cookieValue(cookie: string): string {
  return cookie.slice(AUTH_COOKIE_NAME.length + 1, cookie.indexOf(';'));
}

function validToken(): string {
  return signJwt({ id: trainee.id, name: trainee.name, email: trainee.email, role: 'trainee' });
}

function adminToken(): string {
  return signJwt({ id: admin.id, name: admin.name, email: admin.email, role: 'admin' });
}

beforeEach(() => {
  findBymail.mockReset();
  findActiveAdminById.mockReset();
  findActiveAdminByEmail.mockReset();
  recordAdminLogin.mockReset();
  findActiveAdminByEmail.mockResolvedValue(null); // by default nobody is an admin
  recordAdminLogin.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/auth/google', () => {
  it('redirects to Google requesting the profile and email scopes', async () => {
    const res = await request(app).get(`${BASE}/google`);
    expect(res.status).toBe(302);

    const location = new URL(res.headers.location);
    expect(location.hostname).toBe('accounts.google.com');
    expect(location.searchParams.get('scope')).toBe('profile email');
  });
});

describe('GET /api/auth/google/callback', () => {
  it('sets an httpOnly JWT cookie and redirects a trainee to the frontend home', async () => {
    findBymail.mockResolvedValue(trainee);

    const res = await request(app).get(callbackUrl({ email: trainee.email }));

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(env.FRONTEND_URL);
    expect(findBymail).toHaveBeenCalledWith(trainee.email);

    const cookie = getAuthCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('SameSite=Lax'); // non-production
    expect(cookie).not.toContain('Secure'); // non-production
    expect(cookie).toContain('Max-Age=604800'); // 7 days
  });

  it('signs a token containing id, name, email and role "trainee"', async () => {
    findBymail.mockResolvedValue(trainee);

    const res = await request(app).get(callbackUrl({ email: trainee.email }));

    const payload = verifyJwt(cookieValue(getAuthCookie(res) as string));
    expect(payload).toEqual({ ...trainee, role: 'trainee' });
  });
});

describe('GET /api/auth/google/callback: admins', () => {
  it('redirects an admin to /admin with a role "admin" token', async () => {
    findActiveAdminByEmail.mockResolvedValue(admin);

    const res = await request(app).get(callbackUrl({ email: admin.email }));

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${env.FRONTEND_URL}/admin`);
    const payload = verifyJwt(cookieValue(getAuthCookie(res) as string));
    expect(payload).toEqual({ ...admin, role: 'admin' });
  });

  it('does not look the admin up in the trainee table and records the login', async () => {
    findActiveAdminByEmail.mockResolvedValue(admin);

    await request(app).get(callbackUrl({ email: admin.email }));

    expect(findBymail).not.toHaveBeenCalled();
    expect(recordAdminLogin).toHaveBeenCalledWith(admin.id);
  });

  it('returns 500 and sets no cookie when the admin lookup throws', async () => {
    findActiveAdminByEmail.mockRejectedValue(new Error('connection refused'));

    const res = await request(app).get(callbackUrl({ email: admin.email }));

    expect(res.status).toBe(500);
    expect(getAuthCookie(res)).toBeUndefined();
  });
});

describe('GET /api/auth/google/callback: failures', () => {
  it('redirects with DOMAIN_NOT_PERMITTED + email for a non-approved domain, no cookie', async () => {
    const res = await request(app).get(callbackUrl({ email: 'someone@gmail.com' }));

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBe('DOMAIN_NOT_PERMITTED');
    expect(location.searchParams.get('email')).toBe('someone@gmail.com');
    expect(getAuthCookie(res)).toBeUndefined();
    expect(findActiveAdminByEmail).not.toHaveBeenCalled();
    expect(findBymail).not.toHaveBeenCalled();
  });

  it('redirects with NOT_PROVISIONED + email when the user is in neither table, no cookie', async () => {
    findBymail.mockResolvedValue(null);

    const res = await request(app).get(
      callbackUrl({ email: `new.person@${env.ALLOWED_EMAIL_DOMAIN}` })
    );

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBe('NOT_PROVISIONED');
    expect(location.searchParams.get('email')).toBe(`new.person@${env.ALLOWED_EMAIL_DOMAIN}`);
    expect(getAuthCookie(res)).toBeUndefined();
  });

  it('redirects to /login with an error code when Google returns no email, no cookie', async () => {
    const res = await request(app).get(callbackUrl());

    expect(res.status).toBe(302);
    const location = new URL(res.headers.location);
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBeTruthy();
    expect(getAuthCookie(res)).toBeUndefined();
    expect(findBymail).not.toHaveBeenCalled();
  });

  it('returns 500 and sets no cookie when the database throws', async () => {
    findBymail.mockRejectedValue(new Error('connection refused'));

    const res = await request(app).get(callbackUrl({ email: trainee.email }));

    expect(res.status).toBe(500);
    expect(getAuthCookie(res)).toBeUndefined();
  });
});

describe('GET /api/auth/me', () => {
  it('returns the trainee with role "trainee" for a valid token cookie', async () => {
    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Cookie', `${AUTH_COOKIE_NAME}=${validToken()}`);

    expect(res.status).toBe(200);
    const body = res.body as { id: string; email: string; name: string; role: string };
    expect(body).toEqual({ ...trainee, role: 'trainee' });
  });

  it('returns role "admin" for an admin token', async () => {
    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Cookie', `${AUTH_COOKIE_NAME}=${adminToken()}`);

    expect(res.status).toBe(200);
    expect((res.body as { role: string }).role).toBe('admin');
  });

  it('returns role "trainee" for a token issued before roles existed', async () => {
    const legacy = jwt.sign(
      { id: trainee.id, name: trainee.name, email: trainee.email },
      env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await request(app).get(`${BASE}/me`).set('Cookie', `${AUTH_COOKIE_NAME}=${legacy}`);

    expect(res.status).toBe(200);
    expect((res.body as { role: string }).role).toBe('trainee');
  });

  it('returns 401 without a cookie', async () => {
    const res = await request(app).get(`${BASE}/me`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a malformed token', async () => {
    const res = await request(app).get(`${BASE}/me`).set('Cookie', `${AUTH_COOKIE_NAME}=garbage`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a tampered token', async () => {
    const token = validToken();
    const tampered = `${token.slice(0, -2)}xx`;

    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Cookie', `${AUTH_COOKIE_NAME}=${tampered}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired token', async () => {
    const expired = jwt.sign(
      {
        id: trainee.id,
        name: trainee.name,
        email: trainee.email,
        role: 'trainee',
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      env.JWT_SECRET
    );

    const res = await request(app)
      .get(`${BASE}/me`)
      .set('Cookie', `${AUTH_COOKIE_NAME}=${expired}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a token signed with a different secret', async () => {
    const forged = jwt.sign(
      { id: admin.id, name: admin.name, email: admin.email, role: 'admin' },
      'some-other-secret'
    );

    const res = await request(app).get(`${BASE}/me`).set('Cookie', `${AUTH_COOKIE_NAME}=${forged}`);
    expect(res.status).toBe(401);
  });

  it('ignores a valid token sent in the Authorization header (cookie only)', async () => {
    const res = await request(app).get(`${BASE}/me`).set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it.each<[role: string, token: () => string]>([
    ['trainee', validToken],
    ['admin', adminToken],
  ])('returns 200 and clears the auth cookie for a %s', async (_role, token) => {
    const res = await request(app)
      .post(`${BASE}/logout`)
      .set('Cookie', `${AUTH_COOKIE_NAME}=${token()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Logged out' });

    const cookie = getAuthCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toContain(`${AUTH_COOKIE_NAME}=;`);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970'); // expired => browser deletes it
  });
});

describe('Full session lifecycle', () => {
  it('trainee: login -> /me works -> logout -> /me is rejected', async () => {
    findBymail.mockResolvedValue(trainee);
    const agent = request.agent(app); // keeps cookies between requests, like a browser

    await agent.get(callbackUrl({ email: trainee.email })).expect(302);

    const me = await agent.get(`${BASE}/me`).expect(200);
    expect((me.body as { email: string }).email).toBe(trainee.email);

    await agent.post(`${BASE}/logout`).expect(200);

    await agent.get(`${BASE}/me`).expect(401);
  });

  it('admin: login -> /me says admin -> logout -> /me is rejected', async () => {
    findActiveAdminByEmail.mockResolvedValue(admin);
    const agent = request.agent(app);

    await agent.get(callbackUrl({ email: admin.email })).expect(302);

    const me = await agent.get(`${BASE}/me`).expect(200);
    expect((me.body as { role: string }).role).toBe('admin');

    await agent.post(`${BASE}/logout`).expect(200);

    await agent.get(`${BASE}/me`).expect(401);
  });
});

// describe('CORS', () => {
//   it('allows credentialed requests from the frontend origin only', async () => {
//     const res = await request(app).get(`${BASE}/me`).set('Origin', env.FRONTEND_URL);

//     expect(res.headers['access-control-allow-credentials']).toBe('true');
//     expect(res.headers['access-control-allow-origin']).toBe(env.FRONTEND_URL); // never '*' with cookies
//   });
// });
