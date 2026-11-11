import { createContext } from 'react';
import type { DesktopAuthErrorCode, MeResponse } from '@itp/types';

/** `pending` means the system browser is open and waiting for Google. */
export type AuthStatus = 'loading' | 'pending' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  user: MeResponse | null;
  status: AuthStatus;
  /** Desktop-only failure reason; null in the browser and after success. */
  error: DesktopAuthErrorCode | null;
  isAuthenticated: boolean;
  /** Starts Google sign-in (system browser in Electron, full navigation on the web). */
  login: () => void;

  /** Clears the cookie on the server and the session in the UI. */
  logout: () => Promise<void>;
  /** Re-checks the session with the backend. */
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
