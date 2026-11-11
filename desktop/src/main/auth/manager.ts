import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type {
  DesktopAuthErrorCode,
  DesktopAuthSessionResponse,
  DesktopAuthState,
} from '@itp/types';
import { DesktopAuthApiError, type DesktopAuthApi } from './api';
import { LoopbackError, startLoopbackListener, type LoopbackListener } from './loopback';

/** Matches the backend transaction TTL. */
export const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/** Refresh a little before the access token expires. */
const REFRESH_SKEW_MS = 60_000;
const REFRESH_RETRY_MS = 60_000;

export interface DesktopAuthCookieStore {
  set(accessToken: string, expiresAt: string): Promise<void>;
  clear(): Promise<void>;
}

export interface DesktopAuthManagerOptions {
  api: DesktopAuthApi;
  cookies: DesktopAuthCookieStore;
  storage: {
    isPersistent(): boolean;
    load(): Promise<string | null>;
    save(refreshToken: string): Promise<boolean>;
    clear(): Promise<void>;
  };
  /** System-browser opener. Only the backend origin is accepted. */
  openExternal: (url: string) => Promise<void> | void;
  /** Origin of the API (for example `http://localhost:3000`). */
  apiOrigin: string;
  createLoopback?: (options: { timeoutMs: number }) => Promise<LoopbackListener>;
  clock?: () => number;
  logger?: Pick<Console, 'warn' | 'error'>;
}

const base64url = (value: Buffer): string => value.toString('base64url');

function sha256Base64url(value: string): string {
  return base64url(createHash('sha256').update(value).digest());
}

function valuesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isTerminalSessionError(code: DesktopAuthErrorCode): boolean {
  return (
    code === 'SESSION_EXPIRED' ||
    code === 'SESSION_REVOKED' ||
    code === 'INVALID_CODE' ||
    code === 'EXPIRED'
  );
}

function errorCodeFrom(error: unknown): DesktopAuthErrorCode {
  if (error instanceof DesktopAuthApiError) return error.code;
  if (error instanceof LoopbackError) return error.code;
  return 'AUTH_FAILED';
}

type PendingLogin = {
  listener: LoopbackListener;
  cancelled: boolean;
};

/**
 * Owns every token in the desktop app. The renderer only sees the resulting
 * user and status through IPC; access tokens live in main memory, the refresh
 * token lives in main memory plus OS-encrypted storage, and the renderer gets
 * an httpOnly cookie so the existing API middleware keeps working.
 */
export class DesktopAuthManager {
  private state: DesktopAuthState = {
    status: 'loading',
    user: null,
    error: null,
    persistent: false,
  };

  private readonly listeners = new Set<(state: DesktopAuthState) => void>();
  private readonly createLoopback: (options: { timeoutMs: number }) => Promise<LoopbackListener>;
  private readonly clock: () => number;
  private readonly logger: Pick<Console, 'warn' | 'error'>;

  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private pending: PendingLogin | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<DesktopAuthState> | null = null;
  private initializePromise: Promise<DesktopAuthState> | null = null;

  constructor(private readonly options: DesktopAuthManagerOptions) {
    this.createLoopback = options.createLoopback ?? startLoopbackListener;
    this.clock = options.clock ?? Date.now;
    this.logger = options.logger ?? console;
  }

  getState(): DesktopAuthState {
    return { ...this.state };
  }

  onChange(listener: (state: DesktopAuthState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Restore a stored refresh token. Safe to call more than once. */
  initialize(): Promise<DesktopAuthState> {
    this.initializePromise ??= this.restore();
    return this.initializePromise;
  }

  async login(): Promise<DesktopAuthState> {
    await this.initialize();
    if (this.state.status === 'authenticated') return this.getState();
    if (this.pending) await this.cancel();

    this.update({ status: 'pending', user: null, error: null });

    const codeVerifier = base64url(randomBytes(32));
    const codeChallenge = sha256Base64url(codeVerifier);

    let listener: LoopbackListener;
    try {
      listener = await this.createLoopback({ timeoutMs: LOGIN_TIMEOUT_MS });
    } catch (error) {
      this.fail(errorCodeFrom(error) === 'PORT_UNAVAILABLE' ? 'PORT_UNAVAILABLE' : 'AUTH_FAILED');
      return this.getState();
    }

    const pending: PendingLogin = { listener, cancelled: false };
    this.pending = pending;

    try {
      const transaction = await this.options.api.createTransaction({
        redirectUri: listener.redirectUri,
        codeChallenge,
        codeChallengeMethod: 'S256',
      });

      const authorizationUrl = new URL(transaction.authorizationUrl, this.options.apiOrigin);
      if (
        authorizationUrl.origin !== this.options.apiOrigin ||
        !authorizationUrl.pathname.startsWith('/api/auth/desktop/')
      ) {
        throw new DesktopAuthApiError('AUTH_FAILED');
      }

      await this.options.openExternal(authorizationUrl.toString());

      const callback = await listener.waitForCallback();
      if (pending.cancelled) throw new LoopbackError('CANCELLED');

      if (callback.error) {
        this.fail(errorCodeFrom(new DesktopAuthApiError(mapCode(callback.error))));
        return this.getState();
      }
      if (!callback.code || !callback.state || !valuesEqual(callback.state, transaction.state)) {
        this.fail('INVALID_STATE');
        return this.getState();
      }

      const session = await this.options.api.exchange(callback.code, codeVerifier);
      await this.applySession(session);
      return this.getState();
    } catch (error) {
      this.fail(errorCodeFrom(error));
      return this.getState();
    } finally {
      if (this.pending === pending) this.pending = null;
      await listener.close();
    }
  }

  async cancel(): Promise<void> {
    const pending = this.pending;
    if (!pending) return;

    this.pending = null;
    pending.cancelled = true;
    await pending.listener.close();
    this.update({ status: 'unauthenticated', user: null, error: 'CANCELLED' });
  }

  /** Rotate the refresh token and put a fresh access cookie in place. */
  async refresh(): Promise<DesktopAuthState> {
    if (!this.refreshToken) {
      this.update({ status: 'unauthenticated', user: null, error: null, persistent: false });
      return this.getState();
    }
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      const refreshToken = this.refreshToken as string;
      try {
        const session = await this.options.api.refresh(refreshToken);
        await this.applySession(session);
      } catch (error) {
        const code = errorCodeFrom(error);
        if (isTerminalSessionError(code)) {
          await this.clearSession(code);
        } else {
          this.update({ error: code });
          this.scheduleRefreshRetry();
        }
      } finally {
        this.refreshPromise = null;
      }
      return this.getState();
    })();

    return this.refreshPromise;
  }

  async logout(): Promise<void> {
    if (this.pending) await this.cancel();

    const accessToken = this.accessToken ?? undefined;
    const refreshToken = this.refreshToken ?? undefined;

    try {
      await this.options.api.logout({ accessToken, refreshToken });
    } catch (error) {
      // Local sign-out must still succeed when the backend is unreachable.
      this.logger.warn('[auth] Could not revoke the session on the server', error);
    } finally {
      await this.clearSession(null);
    }
  }

  dispose(): void {
    this.clearRefreshTimer();
    this.listeners.clear();
  }

  private async restore(): Promise<DesktopAuthState> {
    await this.options.cookies.clear().catch((error: unknown) => {
      this.logger.warn('[auth] Could not clear the old auth cookie', error);
    });

    let storedToken: string | null = null;
    try {
      storedToken = await this.options.storage.load();
    } catch (error) {
      this.logger.warn('[auth] Could not read the stored session', error);
    }

    if (!storedToken) {
      this.update({ status: 'unauthenticated', user: null, error: null, persistent: false });
      return this.getState();
    }

    this.refreshToken = storedToken;

    try {
      const session = await this.options.api.refresh(storedToken);
      await this.applySession(session);
    } catch (error) {
      const code = errorCodeFrom(error);
      if (isTerminalSessionError(code)) {
        await this.options.storage.clear();
        this.refreshToken = null;
        this.update({ status: 'unauthenticated', user: null, error: code, persistent: false });
      } else {
        // Keep the refresh token: a temporary outage must not sign the user out
        // permanently. The next launch (or a manual retry) can use it.
        this.update({
          status: 'unauthenticated',
          user: null,
          error: 'BACKEND_UNAVAILABLE',
          persistent: false,
        });
      }
    }

    return this.getState();
  }

  private async applySession(session: DesktopAuthSessionResponse): Promise<void> {
    this.accessToken = session.accessToken;
    this.refreshToken = session.refreshToken;

    let persistent = false;
    try {
      persistent = await this.options.storage.save(session.refreshToken);
    } catch (error) {
      this.logger.warn('[auth] Could not persist the session', error);
    }

    try {
      await this.options.cookies.set(session.accessToken, session.accessTokenExpiresAt);
    } catch (error) {
      this.logger.error('[auth] Could not set the auth cookie', error);
    }

    this.scheduleRefresh(session.accessTokenExpiresAt);
    this.update({
      status: 'authenticated',
      user: session.user,
      error: null,
      persistent,
    });
  }

  private async clearSession(error: DesktopAuthErrorCode | null): Promise<void> {
    this.clearRefreshTimer();
    this.accessToken = null;
    this.refreshToken = null;

    await this.options.cookies.clear().catch((cookieError: unknown) => {
      this.logger.warn('[auth] Could not clear the auth cookie', cookieError);
    });
    await this.options.storage.clear().catch((storageError: unknown) => {
      this.logger.warn('[auth] Could not clear the stored session', storageError);
    });

    this.update({ status: 'unauthenticated', user: null, error, persistent: false });
  }

  private fail(error: DesktopAuthErrorCode): void {
    this.clearRefreshTimer();
    this.update({ status: 'unauthenticated', user: null, error, persistent: false });
  }

  private scheduleRefresh(expiresAt: string): void {
    this.clearRefreshTimer();
    const delay = Math.max(1_000, new Date(expiresAt).getTime() - this.clock() - REFRESH_SKEW_MS);
    this.refreshTimer = setTimeout(() => {
      void this.refresh();
    }, delay);
    this.refreshTimer.unref?.();
  }

  private scheduleRefreshRetry(): void {
    this.clearRefreshTimer();
    this.refreshTimer = setTimeout(() => {
      void this.refresh();
    }, REFRESH_RETRY_MS);
    this.refreshTimer.unref?.();
  }

  private clearRefreshTimer(): void {
    if (!this.refreshTimer) return;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  private update(patch: Partial<DesktopAuthState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) {
      try {
        listener(this.getState());
      } catch (error) {
        this.logger.warn('[auth] A state listener threw', error);
      }
    }
  }
}

/** `callback.error` carries a backend error code; translate it defensively. */
function mapCode(code: string): DesktopAuthErrorCode {
  switch (code) {
    case 'DESKTOP_AUTH_CANCELLED':
      return 'CANCELLED';
    case 'DOMAIN_NOT_PERMITTED':
      return 'DOMAIN_NOT_PERMITTED';
    case 'NOT_PROVISIONED':
      return 'NOT_PROVISIONED';
    case 'DESKTOP_AUTH_EXPIRED':
      return 'EXPIRED';
    case 'DESKTOP_AUTH_INVALID_STATE':
      return 'INVALID_STATE';
    default:
      return 'AUTH_FAILED';
  }
}
