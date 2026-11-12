import type {
  DesktopAuthErrorCode,
  DesktopAuthExchangeRequest,
  DesktopAuthLogoutRequest,
  DesktopAuthRefreshRequest,
  DesktopAuthSessionResponse,
  DesktopAuthTransactionRequest,
  DesktopAuthTransactionResponse,
  MeResponse,
} from '@itp/types';

const REQUEST_TIMEOUT_MS = 15_000;

/** An error that the renderer can be told about without exposing backend details. */
export class DesktopAuthApiError extends Error {
  constructor(
    readonly code: DesktopAuthErrorCode,
    readonly status?: number
  ) {
    super(code);
    this.name = 'DesktopAuthApiError';
  }
}

/**
 * The backend's desktop error codes are translated into the smaller set the
 * renderer understands. Unknown codes deliberately become AUTH_FAILED so a
 * backend change cannot leak new internals into the UI.
 */
export function mapBackendErrorCode(code: unknown): DesktopAuthErrorCode {
  switch (code) {
    case 'DESKTOP_AUTH_INVALID_STATE':
      return 'INVALID_STATE';
    case 'DESKTOP_AUTH_INVALID_PKCE':
      return 'INVALID_PKCE';
    case 'DESKTOP_AUTH_INVALID_CODE':
      return 'INVALID_CODE';
    case 'DESKTOP_AUTH_EXPIRED':
      return 'EXPIRED';
    case 'DESKTOP_AUTH_CODE_USED':
      return 'CODE_USED';
    case 'DESKTOP_AUTH_CANCELLED':
      return 'CANCELLED';
    case 'DOMAIN_NOT_PERMITTED':
      return 'DOMAIN_NOT_PERMITTED';
    case 'NOT_PROVISIONED':
      return 'NOT_PROVISIONED';
    case 'DESKTOP_SESSION_EXPIRED':
      return 'SESSION_EXPIRED';
    case 'DESKTOP_SESSION_REVOKED':
      return 'SESSION_REVOKED';
    default:
      return 'AUTH_FAILED';
  }
}

export interface DesktopAuthApi {
  createTransaction(input: DesktopAuthTransactionRequest): Promise<DesktopAuthTransactionResponse>;
  exchange(code: string, codeVerifier: string): Promise<DesktopAuthSessionResponse>;
  refresh(refreshToken: string): Promise<DesktopAuthSessionResponse>;
  getSession(accessToken: string): Promise<{ user: MeResponse }>;
  logout(tokens: { accessToken?: string; refreshToken?: string }): Promise<void>;
}

/**
 * Calls the backend directly from the main process. Request bodies and
 * responses never pass through the renderer.
 */
export class HttpDesktopAuthApi implements DesktopAuthApi {
  private readonly baseUrl: string;

  constructor(
    apiUrl: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    this.baseUrl = new URL(apiUrl).origin;
  }

  async createTransaction(
    input: DesktopAuthTransactionRequest
  ): Promise<DesktopAuthTransactionResponse> {
    return this.request<DesktopAuthTransactionResponse>('POST', '/api/auth/desktop/transactions', {
      body: input,
    });
  }

  async exchange(code: string, codeVerifier: string): Promise<DesktopAuthSessionResponse> {
    const body: DesktopAuthExchangeRequest = { code, codeVerifier };
    return this.request<DesktopAuthSessionResponse>('POST', '/api/auth/desktop/exchange', {
      body,
    });
  }

  async refresh(refreshToken: string): Promise<DesktopAuthSessionResponse> {
    const body: DesktopAuthRefreshRequest = { refreshToken };
    return this.request<DesktopAuthSessionResponse>('POST', '/api/auth/desktop/refresh', {
      body,
    });
  }

  async getSession(accessToken: string): Promise<{ user: MeResponse }> {
    return this.request<{ user: MeResponse }>('GET', '/api/auth/desktop/session', {
      accessToken,
    });
  }

  async logout(tokens: { accessToken?: string; refreshToken?: string }): Promise<void> {
    const body: DesktopAuthLogoutRequest = tokens.refreshToken
      ? { refreshToken: tokens.refreshToken }
      : {};
    await this.request<void>('POST', '/api/auth/desktop/logout', {
      body,
      accessToken: tokens.accessToken,
    });
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: {
      body?: unknown;
      accessToken?: string;
    } = {}
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new DesktopAuthApiError('BACKEND_UNAVAILABLE');
    }

    if (!response.ok) {
      const errorCode = await readErrorCode(response);
      throw new DesktopAuthApiError(mapBackendErrorCode(errorCode), response.status);
    }

    if (response.status === 204) return undefined as T;

    try {
      return (await response.json()) as T;
    } catch {
      throw new DesktopAuthApiError('AUTH_FAILED', response.status);
    }
  }
}

async function readErrorCode(response: Response): Promise<unknown> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    return body.error?.code;
  } catch {
    return undefined;
  }
}
