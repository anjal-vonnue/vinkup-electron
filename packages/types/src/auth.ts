import type { MeResponse } from './common';

/**
 * Error codes the Electron main process reports to the renderer.
 * They are intentionally separate from the backend API error codes:
 * the renderer only needs to know what went wrong, never why in detail.
 */
export type DesktopAuthErrorCode =
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'INVALID_STATE'
  | 'INVALID_PKCE'
  | 'INVALID_CODE'
  | 'EXPIRED'
  | 'CODE_USED'
  | 'AUTH_FAILED'
  | 'DOMAIN_NOT_PERMITTED'
  | 'NOT_PROVISIONED'
  | 'BACKEND_UNAVAILABLE'
  | 'PORT_UNAVAILABLE'
  | 'SECURE_STORAGE_UNAVAILABLE'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED';

export type DesktopAuthStatus = 'loading' | 'pending' | 'authenticated' | 'unauthenticated';

/** The only authentication state the renderer ever receives. Tokens stay in main. */
export interface DesktopAuthState {
  status: DesktopAuthStatus;
  user: MeResponse | null;
  error: DesktopAuthErrorCode | null;
  /** True when the refresh token is stored with the OS secure storage backend. */
  persistent: boolean;
}

/** POST /api/auth/desktop/transactions */
export interface DesktopAuthTransactionRequest {
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/** POST /api/auth/desktop/transactions */
export interface DesktopAuthTransactionResponse {
  transactionId: string;
  state: string;
  authorizationUrl: string;
  expiresAt: string;
}

/** POST /api/auth/desktop/exchange */
export interface DesktopAuthExchangeRequest {
  code: string;
  codeVerifier: string;
}

/** POST /api/auth/desktop/exchange and POST /api/auth/desktop/refresh */
export interface DesktopAuthSessionResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: MeResponse;
}

/** POST /api/auth/desktop/refresh */
export interface DesktopAuthRefreshRequest {
  refreshToken: string;
}

/** POST /api/auth/desktop/logout */
export interface DesktopAuthLogoutRequest {
  refreshToken?: string;
}
