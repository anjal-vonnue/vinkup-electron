import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { DesktopApi, ResourcesAllowlist, ResourcesBrowserState } from '@itp/types';
import ResourcesPage from './ResourcesPage';

const allowlist: ResourcesAllowlist = {
  version: 2,
  updatedAt: '2026-01-01',
  domains: ['codepen.io', 'react.dev'],
  categories: [
    { id: 'css', label: 'CSS & Layout', domains: ['codepen.io'] },
    { id: 'javascript', label: 'JavaScript', domains: ['codepen.io'] },
    { id: 'react', label: 'React & Vite', domains: ['react.dev'] },
    { id: 'practice', label: 'Practice & Videos', domains: ['codepen.io'] },
  ],
};

const initialState: ResourcesBrowserState = {
  url: '',
  title: '',
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  isHome: true,
  isBlocked: false,
  blockedUrl: null,
  blockedHost: null,
  error: null,
};

const navigate = vi.fn(() => Promise.resolve(initialState));

function installDesktopApi(): void {
  const resources: DesktopApi['resources'] = {
    getAllowlist: () => Promise.resolve(allowlist),
    getState: () => Promise.resolve(initialState),
    open: () => Promise.resolve(initialState),
    setBounds: () => Promise.resolve(),
    close: () => Promise.resolve(),
    home: () => Promise.resolve(),
    navigate,
    goBack: () => Promise.resolve(),
    goForward: () => Promise.resolve(),
    reload: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    onChange: () => () => undefined,
    onFocusAddress: () => () => undefined,
  };

  window.desktop = { resources } as unknown as DesktopApi;
}

vi.mock('../../context/Useauth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Rahul Sharma', email: 'rahul@example.com' },
    isLoading: false,
    logout: vi.fn(),
  }),
}));

vi.mock('../../context/useActivity', () => ({
  useActivity: () => ({ flushNow: vi.fn() }),
}));

afterEach(() => {
  delete (window as { desktop?: DesktopApi }).desktop;
  navigate.mockClear();
});

describe('ResourcesPage', () => {
  it('groups the approved sites into categories', async () => {
    installDesktopApi();

    render(
      <MemoryRouter>
        <ResourcesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('CSS & Layout')).toBeInTheDocument();
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
    expect(screen.getByText('React & Vite')).toBeInTheDocument();
    expect(screen.getByText('Practice & Videos')).toBeInTheDocument();

    // A site that belongs to several categories is shown in each of them.
    expect(screen.getAllByRole('button', { name: /codepen\.io/i })).toHaveLength(3);
  });

  it('opens a category site in the embedded browser', async () => {
    installDesktopApi();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ResourcesPage />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: /react\.dev/i }));
    expect(navigate).toHaveBeenCalledWith('react.dev');
  });

  it('explains that the browser needs the desktop app', () => {
    render(
      <MemoryRouter>
        <ResourcesPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/only available in the VinkUp desktop app/i)).toBeInTheDocument();
  });
});
