import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import Header from './Header';
import { MemoryRouter } from 'react-router';

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
});
