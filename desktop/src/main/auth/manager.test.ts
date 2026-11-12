import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DesktopAuthTransactionRequest,
  DesktopAuthTransactionResponse,
  DesktopAuthSessionResponse,
} from '@itp/types';
import { DesktopAuthApiError, type DesktopAuthApi } from './api';
import { LoopbackError, type LoopbackCallback, type LoopbackListener } from './loopback';
import { DesktopAuthManager, type DesktopAuthManagerOptions } from './manager';

const user = {
  id: 'u1',
  email: 'trainee@vonnue.com',
  name: 'Test Trainee',
  role: 'trainee' as const,
};

function session(accessToken = 'access-1', refreshToken = 'refresh-1'): DesktopAuthSessionResponse {
  return {
    accessToken,
    accessTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    refreshToken,
    refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    user,
  };
}

class FakeApi implements DesktopAuthApi {
  readonly createCalls: DesktopAuthTransactionRequest[] = [];
  readonly exchangeCalls: Array<{ code: string; codeVerifier: string }> = [];
  readonly refreshCalls: string[] = [];
  readonly logoutCalls: Array<{ accessToken?: string; refreshToken?: string }> = [];

  transaction: DesktopAuthTransactionResponse = {
    transactionId: 'transaction-1',
    state: 'state-1',
    authorizationUrl: '/api/auth/desktop/google?transaction=transaction-1',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
  exchangeResult: DesktopAuthSessionResponse | Error = session();
  refreshResult: DesktopAuthSessionResponse | Error = session();
  logoutError: Error | null = null;

  createTransaction(input: DesktopAuthTransactionRequest): Promise<DesktopAuthTransactionResponse> {
    this.createCalls.push(input);
    return Promise.resolve(this.transaction);
  }

  exchange(code: string, codeVerifier: string): Promise<DesktopAuthSessionResponse> {
    this.exchangeCalls.push({ code, codeVerifier });
    if (this.exchangeResult instanceof Error) return Promise.reject(this.exchangeResult);
    return Promise.resolve(this.exchangeResult);
  }

  refresh(refreshToken: string): Promise<DesktopAuthSessionResponse> {
    this.refreshCalls.push(refreshToken);
    if (this.refreshResult instanceof Error) return Promise.reject(this.refreshResult);
    return Promise.resolve(this.refreshResult);
  }

  getSession(): Promise<{ user: typeof user }> {
    return Promise.resolve({ user });
  }

  logout(tokens: { accessToken?: string; refreshToken?: string }): Promise<void> {
    this.logoutCalls.push(tokens);
    if (this.logoutError) return Promise.reject(this.logoutError);
    return Promise.resolve();
  }
}

class FakeStorage {
  token: string | null;
  persistent: boolean;
  failSave = false;

  constructor(token: string | null = null, persistent = true) {
    this.token = token;
    this.persistent = persistent;
  }

  isPersistent(): boolean {
    return this.persistent;
  }

  load(): Promise<string | null> {
    return Promise.resolve(this.token);
  }

  save(refreshToken: string): Promise<boolean> {
    if (!this.persistent || this.failSave) return Promise.resolve(false);
    this.token = refreshToken;
    return Promise.resolve(true);
  }

  clear(): Promise<void> {
    this.token = null;
    return Promise.resolve();
  }
}

class FakeCookies {
  readonly setCalls: Array<{ accessToken: string; expiresAt: string }> = [];
  clears = 0;

  set(accessToken: string, expiresAt: string): Promise<void> {
    this.setCalls.push({ accessToken, expiresAt });
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.clears += 1;
    return Promise.resolve();
  }
}

type FakeLoopback = {
  listener: LoopbackListener;
  waiting: boolean;
  closed: boolean;
  deliver(callback: LoopbackCallback): void;
  reject(error: Error): void;
};

function makeFakeLoopback(): FakeLoopback {
  let callbackResolve: ((value: LoopbackCallback) => void) | null = null;
  let callbackReject: ((error: Error) => void) | null = null;

  const fake: FakeLoopback = {
    waiting: false,
    closed: false,
    listener: {
      redirectUri: 'http://127.0.0.1:55555/callback',
      waitForCallback: () => {
        fake.waiting = true;
        return new Promise<LoopbackCallback>((resolve, reject) => {
          callbackResolve = resolve;
          callbackReject = reject;
        });
      },
      close: () => {
        fake.closed = true;
        callbackReject?.(new LoopbackError('CANCELLED'));
        callbackResolve = null;
        callbackReject = null;
        return Promise.resolve();
      },
    },
    deliver(callback) {
      callbackResolve?.(callback);
      callbackResolve = null;
      callbackReject = null;
    },
    reject(error) {
      callbackReject?.(error);
      callbackResolve = null;
      callbackReject = null;
    },
  };

  return fake;
}

type Harness = {
  manager: DesktopAuthManager;
  api: FakeApi;
  storage: FakeStorage;
  cookies: FakeCookies;
  openExternal: ReturnType<typeof vi.fn>;
  currentLoopback: () => FakeLoopback;
};

function createHarness(
  overrides: Partial<DesktopAuthManagerOptions> = {},
  options: { token?: string | null; persistent?: boolean } = {}
): Harness {
  const api = new FakeApi();
  const storage = new FakeStorage(options.token ?? null, options.persistent ?? true);
  const cookies = new FakeCookies();
  const openExternal = vi.fn(() => Promise.resolve());
  let current: FakeLoopback | null = null;

  const manager = new DesktopAuthManager({
    api,
    cookies,
    storage,
    apiOrigin: 'http://localhost:3000',
    openExternal,
    createLoopback: () => {
      current = makeFakeLoopback();
      return Promise.resolve(current.listener);
    },
    logger: { warn: () => undefined, error: () => undefined },
    ...overrides,
  });

  return {
    manager,
    api,
    storage,
    cookies,
    openExternal,
    currentLoopback: () => {
      if (!current) throw new Error('No loopback listener was created');
      return current;
    },
  };
}

const managers: DesktopAuthManager[] = [];

function harness(
  overrides: Partial<DesktopAuthManagerOptions> = {},
  options: { token?: string | null; persistent?: boolean } = {}
): Harness {
  const created = createHarness(overrides, options);
  managers.push(created.manager);
  return created;
}

afterEach(() => {
  for (const manager of managers.splice(0)) manager.dispose();
});

describe('DesktopAuthManager: startup restore', () => {
  it('restores an encrypted session, sets a cookie and marks it persistent', async () => {
    const { manager, api, cookies, storage } = harness({}, { token: 'refresh-1' });

    const state = await manager.initialize();

    expect(api.refreshCalls).toEqual(['refresh-1']);
    expect(state).toMatchObject({ status: 'authenticated', user, persistent: true, error: null });
    expect(cookies.setCalls).toHaveLength(1);
    expect(cookies.setCalls[0]?.accessToken).toBe('access-1');
    expect(storage.token).toBe('refresh-1');
  });

  it('starts unauthenticated when there is no stored token', async () => {
    const { manager, api, cookies } = harness();

    const state = await manager.initialize();

    expect(api.refreshCalls).toHaveLength(0);
    expect(state).toMatchObject({ status: 'unauthenticated', user: null, persistent: false });
    expect(cookies.clears).toBe(1); // clear a stale cookie before restoring
  });

  it('clears an expired stored session', async () => {
    const { manager, api, storage } = harness({}, { token: 'refresh-1' });
    api.refreshResult = new DesktopAuthApiError('SESSION_EXPIRED');

    const state = await manager.initialize();

    expect(state).toMatchObject({ status: 'unauthenticated', error: 'SESSION_EXPIRED' });
    expect(storage.token).toBeNull();
  });

  it('keeps a stored token across a temporary backend outage', async () => {
    const { manager, api, storage } = harness({}, { token: 'refresh-1' });
    api.refreshResult = new DesktopAuthApiError('BACKEND_UNAVAILABLE');

    const state = await manager.initialize();

    expect(state).toMatchObject({
      status: 'unauthenticated',
      error: 'BACKEND_UNAVAILABLE',
      persistent: false,
    });
    expect(storage.token).toBe('refresh-1');
  });
});

describe('DesktopAuthManager: system-browser login', () => {
  it('creates PKCE, opens the backend origin and exchanges the handoff code', async () => {
    const { manager, api, cookies, storage, openExternal, currentLoopback } = harness();

    const login = manager.login();
    await vi.waitFor(() => expect(currentLoopback().waiting).toBe(true));

    expect(manager.getState().status).toBe('pending');
    expect(api.createCalls).toHaveLength(1);
    const request = api.createCalls[0];
    expect(request?.redirectUri).toBe('http://127.0.0.1:55555/callback');
    expect(request?.codeChallengeMethod).toBe('S256');
    expect(request?.codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);

    expect(openExternal).toHaveBeenCalledWith(
      'http://localhost:3000/api/auth/desktop/google?transaction=transaction-1'
    );

    currentLoopback().deliver({ code: 'handoff-code', state: 'state-1' });
    const state = await login;

    expect(api.exchangeCalls).toHaveLength(1);
    expect(api.exchangeCalls[0]?.code).toBe('handoff-code');
    const verifier = api.exchangeCalls[0]?.codeVerifier ?? '';
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(request?.codeChallenge);

    expect(state).toMatchObject({ status: 'authenticated', user, persistent: true });
    expect(cookies.setCalls[0]?.accessToken).toBe('access-1');
    expect(storage.token).toBe('refresh-1');
    expect(currentLoopback().closed).toBe(true);
  });

  it('rejects a callback whose state does not match the transaction', async () => {
    const { manager, api, currentLoopback } = harness();

    const login = manager.login();
    await vi.waitFor(() => expect(currentLoopback().waiting).toBe(true));
    currentLoopback().deliver({ code: 'handoff-code', state: 'attacker-state' });

    await expect(login).resolves.toMatchObject({
      status: 'unauthenticated',
      error: 'INVALID_STATE',
    });
    expect(api.exchangeCalls).toHaveLength(0);
  });

  it('reports a cancelled Google consent screen from the callback', async () => {
    const { manager, currentLoopback } = harness();

    const login = manager.login();
    await vi.waitFor(() => expect(currentLoopback().waiting).toBe(true));
    currentLoopback().deliver({ error: 'DESKTOP_AUTH_CANCELLED', state: 'state-1' });

    await expect(login).resolves.toMatchObject({
      status: 'unauthenticated',
      error: 'CANCELLED',
    });
  });

  it('reports a loopback timeout and closes the listener', async () => {
    const { manager, currentLoopback } = harness();

    const login = manager.login();
    await vi.waitFor(() => expect(currentLoopback().waiting).toBe(true));
    currentLoopback().reject(new LoopbackError('TIMEOUT'));

    await expect(login).resolves.toMatchObject({
      status: 'unauthenticated',
      error: 'TIMEOUT',
    });
    expect(currentLoopback().closed).toBe(true);
  });

  it('cancels an in-flight login', async () => {
    const { manager, currentLoopback } = harness();

    const login = manager.login();
    await vi.waitFor(() => expect(currentLoopback().waiting).toBe(true));

    await manager.cancel();
    await expect(login).resolves.toMatchObject({ error: 'CANCELLED' });
    expect(currentLoopback().closed).toBe(true);
  });

  it('reports a port that could not be bound', async () => {
    const { manager } = harness({
      createLoopback: () => Promise.reject(new LoopbackError('PORT_UNAVAILABLE')),
    });

    await expect(manager.login()).resolves.toMatchObject({
      status: 'unauthenticated',
      error: 'PORT_UNAVAILABLE',
    });
  });

  it('never opens an authorization URL outside the configured backend', async () => {
    const { manager, api, openExternal } = harness();
    api.transaction = {
      ...api.transaction,
      authorizationUrl: 'https://evil.example/steal',
    };

    const state = await manager.login();

    expect(openExternal).not.toHaveBeenCalled();
    expect(state).toMatchObject({ status: 'unauthenticated', error: 'AUTH_FAILED' });
  });

  it('does not start a second flow when already authenticated', async () => {
    const { manager, currentLoopback, api } = harness();

    const login = manager.login();
    await vi.waitFor(() => expect(currentLoopback().waiting).toBe(true));
    currentLoopback().deliver({ code: 'handoff-code', state: 'state-1' });
    await login;

    await expect(manager.login()).resolves.toMatchObject({ status: 'authenticated' });
    expect(api.createCalls).toHaveLength(1);
  });
});

describe('DesktopAuthManager: refresh and logout', () => {
  it('rotates the refresh token and updates the cookie', async () => {
    const { manager, api, cookies, storage } = harness({}, { token: 'refresh-1' });
    await manager.initialize();

    api.refreshResult = session('access-2', 'refresh-2');
    const state = await manager.refresh();

    expect(state).toMatchObject({ status: 'authenticated', persistent: true });
    expect(cookies.setCalls.at(-1)?.accessToken).toBe('access-2');
    expect(storage.token).toBe('refresh-2');
  });

  it('clears the session when a refresh token has expired', async () => {
    const { manager, api, cookies, storage } = harness({}, { token: 'refresh-1' });
    await manager.initialize();

    api.refreshResult = new DesktopAuthApiError('SESSION_REVOKED');
    const state = await manager.refresh();

    expect(state).toMatchObject({ status: 'unauthenticated', error: 'SESSION_REVOKED' });
    expect(storage.token).toBeNull();
    expect(cookies.clears).toBeGreaterThanOrEqual(2);
  });

  it('revokes the server session, clears the cookie and encrypted storage', async () => {
    const { manager, api, cookies, storage, currentLoopback } = harness();
    const login = manager.login();
    await vi.waitFor(() => expect(currentLoopback().waiting).toBe(true));
    currentLoopback().deliver({ code: 'handoff-code', state: 'state-1' });
    await login;

    await manager.logout();

    expect(api.logoutCalls).toEqual([{ accessToken: 'access-1', refreshToken: 'refresh-1' }]);
    expect(storage.token).toBeNull();
    expect(cookies.clears).toBeGreaterThanOrEqual(1);
    expect(manager.getState()).toMatchObject({ status: 'unauthenticated', user: null });
  });

  it('still signs out locally when the backend cannot revoke', async () => {
    const { manager, api, cookies, storage, currentLoopback } = harness();
    const login = manager.login();
    await vi.waitFor(() => expect(currentLoopback().waiting).toBe(true));
    currentLoopback().deliver({ code: 'handoff-code', state: 'state-1' });
    await login;

    api.logoutError = new Error('offline');
    await manager.logout();

    expect(cookies.clears).toBeGreaterThanOrEqual(1);
    expect(storage.token).toBeNull();
    expect(manager.getState()).toMatchObject({ status: 'unauthenticated', user: null });
  });

  it('refresh without a token stays unauthenticated', async () => {
    const { manager, api } = harness();
    await manager.initialize();

    await expect(manager.refresh()).resolves.toMatchObject({ status: 'unauthenticated' });
    expect(api.refreshCalls).toHaveLength(0);
  });
});
