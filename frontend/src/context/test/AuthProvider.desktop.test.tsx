import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DesktopAuthState } from '@itp/types';
import { AuthProvider } from '../AuthProvider';
import { useAuth } from '../Useauth';

vi.mock('../../api/auth', () => ({
  getMe: vi.fn(),
  logout: vi.fn(),
  startGoogleLogin: vi.fn(),
}));
vi.mock('../../api/client', () => ({ setUnauthorizedHandler: vi.fn() }));

const trainee = {
  id: 'u1',
  email: 'trainee@vonnue.com',
  name: 'Test Trainee',
  role: 'trainee' as const,
};

const listeners = new Set<(state: DesktopAuthState) => void>();
let desktopState: DesktopAuthState = {
  status: 'unauthenticated',
  user: null,
  error: null,
  persistent: false,
};

const desktopAuth = {
  getState: vi.fn(() => Promise.resolve(desktopState)),
  login: vi.fn(() => Promise.resolve(desktopState)),
  cancel: vi.fn(() => Promise.resolve()),
  refresh: vi.fn(() => Promise.resolve(desktopState)),
  logout: vi.fn(() => {
    desktopState = { status: 'unauthenticated', user: null, error: null, persistent: false };
    return Promise.resolve();
  }),
  onChange: (listener: (state: DesktopAuthState) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

function emit(state: DesktopAuthState): void {
  desktopState = state;
  for (const listener of listeners) listener(state);
}

function Probe() {
  const { status, user, error, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{user?.email ?? 'none'}</span>
      <span data-testid="error">{error ?? 'none'}</span>
      <button onClick={login}>login</button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

beforeEach(() => {
  listeners.clear();
  desktopState = { status: 'unauthenticated', user: null, error: null, persistent: false };
  vi.clearAllMocks();
  Object.defineProperty(window, 'desktop', {
    configurable: true,
    value: { auth: desktopAuth },
  });
});

afterEach(() => {
  Reflect.deleteProperty(window, 'desktop');
});

describe('AuthProvider inside Electron', () => {
  it('restores the state from the main process', async () => {
    desktopState = {
      status: 'authenticated',
      user: trainee,
      error: null,
      persistent: true,
    };

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));
    expect(screen.getByTestId('email').textContent).toBe(trainee.email);
    expect(desktopAuth.getState).toHaveBeenCalledTimes(1);
  });

  it('follows pending and error updates pushed by main', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));

    act(() => emit({ status: 'pending', user: null, error: null, persistent: false }));
    expect(screen.getByTestId('status').textContent).toBe('pending');

    act(() =>
      emit({
        status: 'unauthenticated',
        user: null,
        error: 'DOMAIN_NOT_PERMITTED',
        persistent: false,
      })
    );
    expect(screen.getByTestId('error').textContent).toBe('DOMAIN_NOT_PERMITTED');
  });

  it('starts the main-process login instead of navigating', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));

    fireEvent.click(screen.getByText('login'));

    expect(desktopAuth.login).toHaveBeenCalledTimes(1);
    expect(window.location.href).not.toContain('/api/auth/google');
  });

  it('asks main to revoke the session and clears the UI', async () => {
    desktopState = {
      status: 'authenticated',
      user: trainee,
      error: null,
      persistent: true,
    };

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'));

    fireEvent.click(screen.getByText('logout'));

    await waitFor(() => expect(desktopAuth.logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('unauthenticated'));
    expect(screen.getByTestId('email').textContent).toBe('none');
  });

  it('unsubscribes from main when unmounted', async () => {
    const { unmount } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(listeners.size).toBe(1));

    unmount();

    expect(listeners.size).toBe(0);
  });
});
