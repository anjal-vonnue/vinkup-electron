import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import Header from './Header';
import { MemoryRouter, Route, Routes } from 'react-router';

const mockLogout = vi.fn();

vi.mock('../../context/Useauth', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      name: 'Rahul Sharma',
      email: 'rahul@example.com',
    },
    isLoading: false,
    logout: mockLogout,
  }),
}));

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'desktop');
});

describe('Header', () => {
  it('renders the app name, dashboard link, and user name', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );
    expect(screen.getByText('Vink')).toHaveTextContent('VinkUp');
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Rahul Sharma')).toBeInTheDocument();
  });

  it('renders Dashboard and user name as navigation links and logout as a button', () => {
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Resources' })).toHaveAttribute('href', '/resources');
    expect(screen.getByRole('link', { name: 'Rahul Sharma' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
  });

  it('disables the Resources navigation while the secondary display is using Resources', async () => {
    let availabilityListener:
      | ((availability: {
          mainResourcesActive: boolean;
          secondaryResourcesActive: boolean;
        }) => void)
      | undefined;
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: {
        window: {
          getBrowserAvailability: vi.fn().mockResolvedValue({
            mainResourcesActive: false,
            secondaryResourcesActive: false,
          }),
          onBrowserAvailabilityChange: (
            listener: (availability: {
              mainResourcesActive: boolean;
              secondaryResourcesActive: boolean;
            }) => void
          ) => {
            availabilityListener = listener;
            return vi.fn();
          },
        },
      },
    });

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const resourcesLink = screen.getByRole('link', { name: 'Resources' });
    await waitFor(() => {
      expect(resourcesLink).toHaveAttribute('aria-disabled', 'false');
    });
    act(() => {
      availabilityListener?.({
        mainResourcesActive: false,
        secondaryResourcesActive: true,
      });
    });

    expect(resourcesLink).toHaveAttribute('aria-disabled', 'true');
    expect(fireEvent.click(resourcesLink)).toBe(false);
  });

  it('does not replace a newer availability event with a stale initial snapshot', async () => {
    let resolveSnapshot:
      | ((availability: {
          mainResourcesActive: boolean;
          secondaryResourcesActive: boolean;
        }) => void)
      | undefined;
    let availabilityListener:
      | ((availability: {
          mainResourcesActive: boolean;
          secondaryResourcesActive: boolean;
        }) => void)
      | undefined;
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: {
        window: {
          getBrowserAvailability: () =>
            new Promise((resolve) => {
              resolveSnapshot = resolve;
            }),
          onBrowserAvailabilityChange: (
            listener: (availability: {
              mainResourcesActive: boolean;
              secondaryResourcesActive: boolean;
            }) => void
          ) => {
            availabilityListener = listener;
            return vi.fn();
          },
        },
      },
    });

    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>
    );

    const resourcesLink = screen.getByRole('link', { name: 'Resources' });
    act(() => {
      availabilityListener?.({
        mainResourcesActive: false,
        secondaryResourcesActive: true,
      });
    });
    await act(() =>
      Promise.resolve().then(() =>
        resolveSnapshot?.({
          mainResourcesActive: false,
          secondaryResourcesActive: false,
        })
      )
    );

    expect(resourcesLink).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows leading content instead of the app name when given', () => {
    render(
      <MemoryRouter>
        <Header leading={<span>Custom crumb</span>} />
      </MemoryRouter>
    );

    expect(screen.getByText('Custom crumb')).toBeInTheDocument();
    expect(screen.queryByText('Vink')).not.toBeInTheDocument();
  });

  it('renders the status slot before the nav', () => {
    render(
      <MemoryRouter>
        <Header status={<span>ACTIVE SESSION</span>} />
      </MemoryRouter>
    );

    expect(screen.getByText('ACTIVE SESSION')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it.each([
    ['/', 'Home'],
    ['/typing-test', 'Typing Test'],
    ['/journal', 'Journal'],
    ['/resources', 'Resources'],
  ])('marks only the active section link on %s', (path, activeLabel) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <Header />
      </MemoryRouter>
    );

    for (const label of ['Home', 'Typing Test', 'Journal', 'Resources']) {
      const className = screen.getByRole('link', { name: label }).className;
      expect(className.includes('active')).toBe(label === activeLabel);
    }
    expect(screen.getByRole('link', { name: 'Home' }).className).not.toMatch(/workspaceActive/);
  });

  it('marks Home active while inside a task workspace', () => {
    render(
      <MemoryRouter initialEntries={['/tasks/t1']}>
        <Routes>
          <Route path="/tasks/:taskId" element={<Header />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Home' }).className).toMatch(/active/);
    expect(screen.getByRole('link', { name: 'Home' }).className).toMatch(/workspaceActive/);
    for (const label of ['Typing Test', 'Journal', 'Resources']) {
      expect(screen.getByRole('link', { name: label }).className).not.toMatch(/active/);
      expect(screen.getByRole('link', { name: label }).className).not.toMatch(/workspaceActive/);
    }
  });

  it('locks the header nav and highlights Checkpoints during a checkpoint attempt', () => {
    render(
      <MemoryRouter initialEntries={['/checkpoints/attempts/a1']}>
        <Routes>
          <Route path="/checkpoints/attempts/:attemptId" element={<Header />} />
          <Route path="/journal" element={<span>Journal page</span>} />
        </Routes>
      </MemoryRouter>
    );

    const checkpointsLink = screen.getByRole('link', { name: 'Checkpoints' });
    expect(checkpointsLink.className).toMatch(/active/);
    expect(checkpointsLink.className).toMatch(/workspaceActive/);
    expect(checkpointsLink).toHaveAttribute('aria-disabled', 'true');
    expect(checkpointsLink).toHaveAttribute('tabindex', '-1');
    expect(checkpointsLink.className).toMatch(/linkDisabled/);
    expect(fireEvent.click(checkpointsLink)).toBe(false);

    for (const label of ['Home', 'Typing Test', 'Journal', 'Leave', 'Resources']) {
      const link = screen.getByRole('link', { name: label });
      expect(link).toHaveAttribute('aria-disabled', 'true');
      expect(link).toHaveAttribute('tabindex', '-1');
      expect(link.className).toMatch(/linkDisabled/);
      expect(link.className).not.toMatch(/active/);
      expect(fireEvent.click(link)).toBe(false);
    }

    expect(screen.queryByText('Journal page')).not.toBeInTheDocument();
  });

  it('does not lock the header on the checkpoint list', () => {
    render(
      <MemoryRouter initialEntries={['/checkpoints']}>
        <Routes>
          <Route path="/checkpoints" element={<Header />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-disabled', 'true');
    const checkpointsLink = screen.getByRole('link', { name: 'Checkpoints' });
    expect(checkpointsLink.className).toMatch(/active/);
    expect(checkpointsLink.className).not.toMatch(/workspaceActive/);
  });

  it.each(['/days/js-day-01', '/days/js-day-01/references'])(
    'marks Home active on the day page (%s)',
    (path) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/days/:dayId" element={<Header />} />
            <Route path="/days/:dayId/references" element={<Header />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByRole('link', { name: 'Home' }).className).toMatch(/active/);
      expect(screen.getByRole('link', { name: 'Home' }).className).not.toMatch(/workspaceActive/);
      for (const label of ['Typing Test', 'Journal', 'Resources']) {
        expect(screen.getByRole('link', { name: label }).className).not.toMatch(/active/);
      }
    }
  );

  it('returns Home to its normal state when navigating from a workspace to a section', () => {
    render(
      <MemoryRouter initialEntries={['/tasks/t1']}>
        <Routes>
          <Route path="/tasks/:taskId" element={<Header />} />
          <Route path="/journal" element={<Header />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Home' }).className).toMatch(/active/);
    expect(screen.getByRole('link', { name: 'Home' }).className).toMatch(/workspaceActive/);
    fireEvent.click(screen.getByRole('link', { name: 'Journal' }));
    expect(screen.getByRole('link', { name: 'Home' }).className).not.toMatch(/active/);
    expect(screen.getByRole('link', { name: 'Home' }).className).not.toMatch(/workspaceActive/);
    expect(screen.getByRole('link', { name: 'Journal' }).className).toMatch(/active/);
  });

  it('returns Home to its normal state when navigating from the day page to a section', () => {
    render(
      <MemoryRouter initialEntries={['/days/js-day-01']}>
        <Routes>
          <Route path="/days/:dayId" element={<Header />} />
          <Route path="/journal" element={<Header />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Home' }).className).toMatch(/active/);
    expect(screen.getByRole('link', { name: 'Home' }).className).not.toMatch(/workspaceActive/);
    fireEvent.click(screen.getByRole('link', { name: 'Journal' }));
    expect(screen.getByRole('link', { name: 'Home' }).className).not.toMatch(/active/);
    expect(screen.getByRole('link', { name: 'Journal' }).className).toMatch(/active/);
  });
});
