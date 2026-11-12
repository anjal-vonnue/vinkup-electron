import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DesktopAuthErrorCode, DesktopAuthState, MeResponse } from '@itp/types';
import { getMe, logout as logoutRequest, startGoogleLogin } from '../api/auth';
import { setUnauthorizedHandler } from '../api/client';
import { ApiError } from '../api/errors';
import { GREETING_SESSION_KEY } from '../constants/greeting';
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext';

async function fetchSession(): Promise<MeResponse | null> {
  try {
    return await getMe();
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 0;
    if (status !== 401) {
      console.error('Failed to load session', error);
    }
    return null;
  }
}

function desktopStatus(status: DesktopAuthState['status']): AuthStatus {
  return status;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<DesktopAuthErrorCode | null>(null);

  // Present only inside the Electron shell. The web app keeps the cookie flow.
  const desktopAuth = typeof window === 'undefined' ? undefined : window.desktop?.auth;

  const applyDesktopState = useCallback((state: DesktopAuthState) => {
    setUser(state.user);
    setStatus(desktopStatus(state.status));
    setError(state.error);
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  // Manual re-check (exposed through the context)
  const refresh = useCallback(async () => {
    if (desktopAuth) {
      applyDesktopState(await desktopAuth.refresh());
      return;
    }

    const me = await fetchSession();
    setUser(me);
    setStatus(me ? 'authenticated' : 'unauthenticated');
  }, [applyDesktopState, desktopAuth]);

  // Restore the session on first load / page refresh. In Electron main owns the
  // session; in the browser the httpOnly cookie is the source of truth.
  useEffect(() => {
    let cancelled = false;

    if (desktopAuth) {
      let receivedEvent = false;
      const unsubscribe = desktopAuth.onChange((state) => {
        receivedEvent = true;
        if (!cancelled) applyDesktopState(state);
      });

      void desktopAuth
        .getState()
        .then((state) => {
          if (!cancelled && !receivedEvent) applyDesktopState(state);
        })
        .catch((restoreError: unknown) => {
          console.error('Failed to load the desktop session', restoreError);
          if (!cancelled) setStatus('unauthenticated');
        });

      return () => {
        cancelled = true;
        unsubscribe();
      };
    }

    void fetchSession().then((me) => {
      if (cancelled) return;
      setUser(me);
      setStatus(me ? 'authenticated' : 'unauthenticated');
    });

    return () => {
      cancelled = true;
    };
  }, [applyDesktopState, desktopAuth]);

  // Any 401 from a protected API call (expired token) silently signs the user out.
  // ProtectedRoute reacts to the status change and redirects to /login.
  useEffect(() => {
    if (desktopAuth) {
      setUnauthorizedHandler(() => {
        // The short-lived access cookie may have expired; main can rotate the
        // refresh token without showing the login screen again.
        void desktopAuth
          .refresh()
          .then((state) => {
            if (state.status !== 'authenticated') clearSession();
          })
          .catch(() => clearSession());
      });
      return () => setUnauthorizedHandler(null);
    }

    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession, desktopAuth]);

  const login = useCallback(() => {
    if (desktopAuth) {
      console.log('desktopAuth');
      void desktopAuth
        .login()
        .then((e) => console.log(e))
        .catch(() => clearSession());
      return;
    }
    console.log('startGoogleLogin');
    startGoogleLogin();
  }, [clearSession, desktopAuth]);

  const logout = useCallback(async () => {
    try {
      if (desktopAuth) {
        await desktopAuth.logout();
      } else {
        await logoutRequest();
      }
      try {
        window.sessionStorage.removeItem(GREETING_SESSION_KEY);
      } catch {
        // Storage may be unavailable; the server logout still completed successfully.
      }
    } finally {
      // Clear local state even if the request failed, so the UI never shows a stale user
      clearSession();
    }
  }, [clearSession, desktopAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      error,
      isAuthenticated: status === 'authenticated',
      login,
      logout,
      refresh,
    }),
    [user, status, error, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
