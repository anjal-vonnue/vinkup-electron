import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
