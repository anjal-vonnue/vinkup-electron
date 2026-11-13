import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { DesktopApi, ResourcesAllowlist, ResourcesBrowserState } from '@itp/types';
import ResourcesPage from './ResourcesPage';

const allowlist: ResourcesAllowlist = {
  version: 3,
  updatedAt: '2026-01-01',
  domains: ['codepen.io', 'react.dev'],
  categories: [
    { id: 'css', label: 'CSS & Layout', domains: ['codepen.io'] },
    { id: 'javascript', label: 'JavaScript', domains: ['codepen.io'] },
    { id: 'react', label: 'React & Vite', domains: ['react.dev'] },
    { id: 'practice', label: 'Practice & Videos', domains: ['codepen.io'] },
  ],
  descriptions: {
    'codepen.io': 'Write and share HTML, CSS and JS in the browser.',
    'react.dev': 'The official React documentation.',
  },
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
  errorKind: null,
  zoom: 100,
};

const navigate = vi.fn(() => Promise.resolve(initialState));
const find = vi.fn(() => Promise.resolve());
const findNext = vi.fn(() => Promise.resolve());
const stopFind = vi.fn(() => Promise.resolve());
const zoomIn = vi.fn(() => Promise.resolve());

function installDesktopApi(
  overrides: Partial<ResourcesBrowserState> = {}
): DesktopApi['resources'] {
  const state: ResourcesBrowserState = { ...initialState, ...overrides };

  const resources: DesktopApi['resources'] = {
    getAllowlist: () => Promise.resolve(allowlist),
    getState: () => Promise.resolve(state),
    open: () => Promise.resolve(state),
    setBounds: () => Promise.resolve(),
    close: () => Promise.resolve(),
    home: () => Promise.resolve(),
    navigate,
    goBack: () => Promise.resolve(),
    goForward: () => Promise.resolve(),
    reload: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    find,
    findNext,
    stopFind,
    zoomIn,
    zoomOut: () => Promise.resolve(),
    zoomReset: () => Promise.resolve(),
    onChange: () => () => undefined,
    onFocusAddress: () => () => undefined,
    onOpenFind: () => () => undefined,
    onFindResult: () => () => undefined,
    onEscape: () => () => undefined,
  };

  window.desktop = { resources } as unknown as DesktopApi;
  return resources;
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
  localStorage.clear();
  navigate.mockClear();
  find.mockClear();
  findNext.mockClear();
  stopFind.mockClear();
  zoomIn.mockClear();
});

describe('ResourcesPage', () => {
  it('groups the approved sites into categories with descriptions', async () => {
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
    expect(screen.getAllByText('Write and share HTML, CSS and JS in the browser.')).toHaveLength(3);
    expect(screen.getByText('The official React documentation.')).toBeInTheDocument();
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

  it('offers to continue the last page that was read', async () => {
    localStorage.setItem(
      'vinkup.resources.lastPage',
      JSON.stringify({ url: 'https://react.dev/learn', title: 'Learn React' })
    );
    installDesktopApi();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ResourcesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Continue where you left off')).toBeInTheDocument();
    expect(screen.getByText('Learn React')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue reading' }));
    expect(navigate).toHaveBeenCalledWith('https://react.dev/learn');
  });

  it('opens the find bar with Ctrl+F and searches the page', async () => {
    installDesktopApi({ isHome: false, url: 'https://react.dev/', title: 'React' });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ResourcesPage />
      </MemoryRouter>
    );

    await screen.findByDisplayValue('https://react.dev/');
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });

    const input = await screen.findByLabelText('Find in page');
    await user.type(input, 'hooks');
    expect(find).toHaveBeenCalledWith('hooks');
  });

  it('shows zoom controls for an open page', async () => {
    installDesktopApi({ isHome: false, url: 'https://react.dev/', title: 'React' });
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ResourcesPage />
      </MemoryRouter>
    );

    await user.click(await screen.findByRole('button', { name: 'Zoom in' }));
    expect(zoomIn).toHaveBeenCalled();
  });

  it('shows the blocked address and access-request actions', async () => {
    installDesktopApi({
      isHome: false,
      isBlocked: true,
      blockedUrl: 'https://example.com/lesson',
      blockedHost: 'example.com',
    });

    render(
      <MemoryRouter>
        <ResourcesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('This site is blocked')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/lesson')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy address' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy access request' })).toBeInTheDocument();
  });

  it('explains an offline load failure', async () => {
    installDesktopApi({
      isHome: false,
      url: 'https://react.dev/',
      error: 'Could not load react.dev. ERR_INTERNET_DISCONNECTED',
      errorKind: 'offline',
    });

    render(
      <MemoryRouter>
        <ResourcesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('You appear to be offline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
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
