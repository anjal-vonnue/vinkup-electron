import { describe, it, expect, vi } from 'vitest';
import { screen, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { MeResponse } from '@itp/types';
import { AuthContext, type AuthContextValue } from '../context/AuthContext';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicOnlyRoute } from './PublicOnlyRoute';
import { RoleRoute } from './RoleRoute';

const user: MeResponse = {
  id: 'u1',
  email: 'trainee@vonnue.com',
  name: 'Test Trainee',
  role: 'trainee',
};
const admin: MeResponse = {
  id: 'a1',
  email: 'mentor@vonnue.com',
  name: 'Test Mentor',
  role: 'admin',
};

const asTrainee = { status: 'authenticated', user, isAuthenticated: true } as const;
const asAdmin = { status: 'authenticated', user: admin, isAuthenticated: true } as const;

function fakeAuth(overrides: Partial<AuthContextValue>): AuthContextValue {
  return {
    user: null,
    status: 'unauthenticated',
    error: null,
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
    ...overrides,
  };
}

// Same shape as App.tsx: trainee pages and admin pages each behind their RoleRoute.
function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<div>login page</div>} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<RoleRoute role="trainee" />}>
          <Route path="/" element={<div>home page</div>} />
          <Route path="/private" element={<div>private page</div>} />
        </Route>
        <Route element={<RoleRoute role="admin" />}>
          <Route path="/admin" element={<div>admin page</div>} />
          <Route path="/admin/trainees/:traineeId" element={<div>admin trainee page</div>} />
        </Route>
      </Route>
    </Routes>
  );
}

function renderApp(route: string, authOverrides: Partial<AuthContextValue>) {
  return render(
    <AuthContext.Provider value={fakeAuth(authOverrides)}>
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthContext.Provider>
  );
}

describe('ProtectedRoute', () => {
  it('shows a loader (not the login page) while the session is being checked', () => {
    renderApp('/private', { status: 'loading' });

    expect(screen.getByText(/loading/i)).toBeDefined();
    expect(screen.queryByText('login page')).toBeNull();
    expect(screen.queryByText('private page')).toBeNull();
  });

  it('redirects unauthenticated users to /login', () => {
    renderApp('/private', { status: 'unauthenticated' });

    expect(screen.getByText('login page')).toBeDefined();
    expect(screen.queryByText('private page')).toBeNull();
  });

  it('redirects unauthenticated users from admin pages to /login', () => {
    renderApp('/admin', { status: 'unauthenticated' });

    expect(screen.getByText('login page')).toBeDefined();
    expect(screen.queryByText('admin page')).toBeNull();
  });

  it('renders the protected page for authenticated users', () => {
    renderApp('/private', asTrainee);

    expect(screen.getByText('private page')).toBeDefined();
  });
});

describe('RoleRoute', () => {
  it('sends a trainee who opens /admin to the trainee home page', () => {
    renderApp('/admin', asTrainee);

    expect(screen.getByText('home page')).toBeDefined();
    expect(screen.queryByText('admin page')).toBeNull();
  });

  it('sends a trainee who opens an admin trainee page to the trainee home page', () => {
    renderApp('/admin/trainees/t-1', asTrainee);

    expect(screen.getByText('home page')).toBeDefined();
    expect(screen.queryByText('admin trainee page')).toBeNull();
  });

  it('sends an admin who opens the trainee home page to /admin', () => {
    renderApp('/', asAdmin);

    expect(screen.getByText('admin page')).toBeDefined();
    expect(screen.queryByText('home page')).toBeNull();
  });

  it('sends an admin who opens any trainee page to /admin', () => {
    renderApp('/private', asAdmin);

    expect(screen.getByText('admin page')).toBeDefined();
    expect(screen.queryByText('private page')).toBeNull();
  });

  it('renders admin pages for an admin', () => {
    renderApp('/admin/trainees/t-1', asAdmin);

    expect(screen.getByText('admin trainee page')).toBeDefined();
  });
});

describe('PublicOnlyRoute', () => {
  it('shows the login page to unauthenticated users', () => {
    renderApp('/login', { status: 'unauthenticated' });

    expect(screen.getByText('login page')).toBeDefined();
  });

  it('redirects an authenticated trainee from /login to the home page', () => {
    renderApp('/login', asTrainee);

    expect(screen.getByText('home page')).toBeDefined();
    expect(screen.queryByText('login page')).toBeNull();
  });

  it('redirects an authenticated admin from /login to /admin', () => {
    renderApp('/login', asAdmin);

    expect(screen.getByText('admin page')).toBeDefined();
    expect(screen.queryByText('login page')).toBeNull();
  });

  it('shows a loader while the session is being checked', () => {
    renderApp('/login', { status: 'loading' });

    expect(screen.getByText(/loading/i)).toBeDefined();
  });
});
