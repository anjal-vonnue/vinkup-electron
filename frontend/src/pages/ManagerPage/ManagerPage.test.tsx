import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ManagerStaffMember, ManagerTrainee } from '@itp/types';
import { ToastProvider } from '../../components/Toast';

const api = vi.hoisted(() => ({
  getManagerStaff: vi.fn(),
  getManagerTrainees: vi.fn(),
  createManagerStaff: vi.fn(),
  createManagerTrainee: vi.fn(),
  updateManagerStaff: vi.fn(),
  updateManagerTrainee: vi.fn(),
  setManagerStaffActive: vi.fn(),
  setManagerTraineeActive: vi.fn(),
  assignTraineeMentor: vi.fn(),
}));

vi.mock('../../api/manager', () => api);

const mockLogout = vi.fn();
vi.mock('../../context/Useauth', () => ({
  useAuth: () => ({
    user: { id: 'manager-1', name: 'Manager One', email: 'manager@vonnue.com', role: 'manager' },
    logout: mockLogout,
  }),
}));

import ManagerPage from './ManagerPage';

const mentor: ManagerStaffMember = {
  id: 'mentor-1',
  name: 'Mentor One',
  email: 'mentor1@vonnue.com',
  role: 'mentor',
  isActive: true,
  assignedTraineeCount: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  lastLoginAt: null,
};

const mentor2: ManagerStaffMember = {
  ...mentor,
  id: 'mentor-2',
  name: 'Mentor Two',
  email: 'mentor2@vonnue.com',
  assignedTraineeCount: 0,
};

const trainee: ManagerTrainee = {
  id: 'trainee-1',
  name: 'Asha Rao',
  email: 'asha@vonnue.com',
  isActive: true,
  mentor: { id: mentor.id, name: mentor.name, email: mentor.email },
};

const unassigned: ManagerTrainee = {
  id: 'trainee-2',
  name: 'Bala Kumar',
  email: 'bala@vonnue.com',
  isActive: false,
  mentor: null,
};

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={['/manager']}>
        <ManagerPage />
      </MemoryRouter>
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getManagerStaff.mockResolvedValue([mentor, mentor2]);
  api.getManagerTrainees.mockResolvedValue([trainee, unassigned]);
});

afterEach(cleanup);

describe('ManagerPage', () => {
  it('lists staff and trainees with assignment controls and account states', async () => {
    renderPage();

    expect(screen.getByText('Loading accounts…')).toBeInTheDocument();

    expect((await screen.findAllByText('Mentor One')).length).toBeGreaterThan(0);
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('Bala Kumar')).toBeInTheDocument();
    expect(screen.getByText('Manager view')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users & assignments' })).toHaveAttribute(
      'href',
      '/manager'
    );

    expect(screen.getByLabelText('Mentor for Asha Rao')).toHaveValue(mentor.id);
    expect(screen.getByLabelText('Mentor for Bala Kumar')).toHaveValue('');
    expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0);
  });

  it('assigns a trainee immediately from the mentor select', async () => {
    api.assignTraineeMentor.mockResolvedValue({
      ...trainee,
      mentor: { id: mentor2.id, name: mentor2.name, email: mentor2.email },
    });

    renderPage();
    const select = await screen.findByLabelText('Mentor for Asha Rao');

    fireEvent.change(select, { target: { value: mentor2.id } });

    await waitFor(() => {
      expect(api.assignTraineeMentor).toHaveBeenCalledWith(trainee.id, { mentorId: mentor2.id });
    });
    expect(await screen.findByText('Asha Rao is now assigned to Mentor Two.')).toBeInTheDocument();
  });

  it('confirms before deactivating an account', async () => {
    api.setManagerTraineeActive.mockResolvedValue({ ...trainee, isActive: false });

    renderPage();
    await screen.findByText('Asha Rao');

    const row = screen.getByText('Asha Rao').closest('tr');
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Deactivate' }));

    expect(screen.getByRole('heading', { name: 'Deactivate account?' })).toBeInTheDocument();
    expect(api.setManagerTraineeActive).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate account' }));

    await waitFor(() => {
      expect(api.setManagerTraineeActive).toHaveBeenCalledWith(trainee.id, { isActive: false });
    });
  });

  it('opens the add staff dialog with role and email fields', async () => {
    renderPage();
    await screen.findByText('Asha Rao');

    fireEvent.click(screen.getByRole('button', { name: 'Add staff' }));

    expect(screen.getByRole('dialog', { name: 'Add staff account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.getByLabelText('Company email')).toBeInTheDocument();
    expect(screen.getByLabelText('Role')).toHaveValue('mentor');
  });

  it('shows an error state with retry when the API fails', async () => {
    api.getManagerStaff.mockRejectedValue(new Error('Server unavailable'));
    api.getManagerTrainees.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
