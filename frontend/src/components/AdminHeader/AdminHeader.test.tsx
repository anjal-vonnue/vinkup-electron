import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import AdminHeader from './AdminHeader';

const mockLogout = vi.fn();

vi.mock('../../context/Useauth', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      name: 'Mentor One',
      email: 'mentor@vonnue.com',
      role: 'mentor',
    },
    isLoading: false,
    logout: mockLogout,
  }),
}));

afterEach(() => {
  cleanup();
  mockLogout.mockReset();
});

function renderHeader(ui = <AdminHeader />, route = '/admin') {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

describe('AdminHeader', () => {
  it('renders the app name, the Mentor view badge and the mentor name', () => {
    renderHeader();

    expect(screen.getByText('Vink')).toHaveTextContent('VinkUp');
    expect(screen.getByText('Mentor view')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));

    expect(screen.getByText('Mentor One')).toBeInTheDocument();
  });

  it('links to the trainee list and nowhere a mentor cannot go', () => {
    renderHeader();

    expect(screen.getByRole('link', { name: 'Trainees' })).toHaveAttribute('href', '/admin');

    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Typing Test' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mentor One' })).not.toBeInTheDocument();
  });

  it('does not keep Trainees active on a trainee detail page', () => {
    renderHeader(<AdminHeader />, '/admin/trainees/abc');

    expect(screen.getByRole('link', { name: 'Trainees' })).not.toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('shows leading content instead of the app name when given', () => {
    renderHeader(<AdminHeader leading={<span>Custom crumb</span>} />);

    expect(screen.getByText('Custom crumb')).toBeInTheDocument();
    expect(screen.queryByText('Vink')).not.toBeInTheDocument();
  });

  it('has a log out button', () => {
    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));

    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument();
  });

  it('logs out when the Log out button is clicked', async () => {
    mockLogout.mockResolvedValueOnce(undefined);

    renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));

    fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });
});
