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
    expect(screen.getByText('Manager view')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users & assignments' })).toHaveAttribute(
      'href',
      '/manager'
    );

    fireEvent.click(screen.getByRole('tab', { name: /Trainees/i }));

    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('Bala Kumar')).toBeInTheDocument();

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
    fireEvent.click(await screen.findByRole('tab', { name: /Trainees/i }));
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
    fireEvent.click(await screen.findByRole('tab', { name: /Trainees/i }));
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
    await screen.findByText('Mentor One');

    fireEvent.click(screen.getByRole('button', { name: 'Add staff' }));

    expect(screen.getByRole('dialog', { name: 'Add staff account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.getByLabelText('Company email')).toBeInTheDocument();
    expect(screen.getByLabelText('Role')).toHaveValue('mentor');
  });

  it('opens the add trainee dialog when in trainees tab', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Trainees/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Add trainee' }));

    expect(screen.getByRole('dialog', { name: 'Add trainee' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.getByLabelText('Company email')).toBeInTheDocument();
  });

  it('shows an error state with retry when the API fails', async () => {
    api.getManagerStaff.mockRejectedValue(new Error('Server unavailable'));
    api.getManagerTrainees.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('filters staff by search query and clears search', async () => {
    renderPage();
    await screen.findByText('Mentor One');
    expect(screen.getByText('Mentor Two')).toBeInTheDocument();

    const searchInput = screen.getByLabelText('Search mentors and managers');
    fireEvent.change(searchInput, { target: { value: 'Two' } });

    expect(screen.queryByText('Mentor One')).not.toBeInTheDocument();
    expect(screen.getByText('Mentor Two')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Clear search input'));
    expect(screen.getByText('Mentor One')).toBeInTheDocument();
    expect(screen.getByText('Mentor Two')).toBeInTheDocument();
  });

  it('shows empty search state when no staff match search query', async () => {
    renderPage();
    await screen.findByText('Mentor One');

    const searchInput = screen.getByLabelText('Search mentors and managers');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    expect(screen.getByText('No matching accounts')).toBeInTheDocument();
    expect(screen.getByText(/No mentors or managers matched/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('Mentor One')).toBeInTheDocument();
  });

  it('filters trainees by search query including mentor name', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Trainees/i }));
    await screen.findByText('Asha Rao');
    expect(screen.getByText('Bala Kumar')).toBeInTheDocument();

    const searchInput = screen.getByLabelText('Search trainees');
    fireEvent.change(searchInput, { target: { value: 'Asha' } });

    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.queryByText('Bala Kumar')).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'Mentor One' } });
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.queryByText('Bala Kumar')).not.toBeInTheDocument();
  });

  it('paginates when items exceed page size', async () => {
    const manyTrainees: ManagerTrainee[] = Array.from({ length: 7 }, (_, i) => ({
      id: `trainee-${i + 1}`,
      name: `Trainee ${String.fromCharCode(65 + i)}`,
      email: `trainee${i + 1}@vonnue.com`,
      isActive: true,
      mentor: null,
    }));
    api.getManagerTrainees.mockResolvedValue(manyTrainees);

    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Trainees/i }));

    expect(await screen.findByText('Trainee A')).toBeInTheDocument();
    expect(screen.getByText('Trainee E')).toBeInTheDocument();
    expect(screen.queryByText('Trainee F')).not.toBeInTheDocument();

    expect(screen.getByText('Showing 1–5 of 7')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));

    expect(screen.getByText('Trainee F')).toBeInTheDocument();
    expect(screen.getByText('Trainee G')).toBeInTheDocument();
    expect(screen.queryByText('Trainee A')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 6–7 of 7')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(screen.getByText('Trainee A')).toBeInTheDocument();
  });

  it('filters trainees by mentor (all, mentor name, unassigned)', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Trainees/i }));
    await screen.findByText('Asha Rao');
    expect(screen.getByText('Bala Kumar')).toBeInTheDocument();

    const mentorSelect = screen.getByLabelText('Filter by mentor');

    // Filter by specific mentor
    fireEvent.change(mentorSelect, { target: { value: mentor.id } });
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.queryByText('Bala Kumar')).not.toBeInTheDocument();

    // Filter by unassigned
    fireEvent.change(mentorSelect, { target: { value: 'unassigned' } });
    expect(screen.queryByText('Asha Rao')).not.toBeInTheDocument();
    expect(screen.getByText('Bala Kumar')).toBeInTheDocument();

    // Reset to all mentors
    fireEvent.change(mentorSelect, { target: { value: 'all' } });
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('Bala Kumar')).toBeInTheDocument();
  });

  it('filters trainees by status (all, active, inactive)', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Trainees/i }));
    await screen.findByText('Asha Rao');
    expect(screen.getByText('Bala Kumar')).toBeInTheDocument();

    const statusSelect = screen.getByLabelText('Filter by status');

    // Filter by active (Asha is active, Bala is inactive)
    fireEvent.change(statusSelect, { target: { value: 'active' } });
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.queryByText('Bala Kumar')).not.toBeInTheDocument();

    // Filter by inactive
    fireEvent.change(statusSelect, { target: { value: 'inactive' } });
    expect(screen.queryByText('Asha Rao')).not.toBeInTheDocument();
    expect(screen.getByText('Bala Kumar')).toBeInTheDocument();

    // Reset to all statuses
    fireEvent.change(statusSelect, { target: { value: 'all' } });
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('Bala Kumar')).toBeInTheDocument();
  });

  it('shows empty filter state when no trainees match filter combination', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Trainees/i }));
    await screen.findByText('Asha Rao');

    const mentorSelect = screen.getByLabelText('Filter by mentor');
    const statusSelect = screen.getByLabelText('Filter by status');

    // Mentor Two has no assigned trainees in fixtures
    fireEvent.change(mentorSelect, { target: { value: mentor2.id } });
    expect(screen.getByText('No matching trainees')).toBeInTheDocument();
    expect(screen.getByText('No trainees matched the selected filters.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('Bala Kumar')).toBeInTheDocument();
    expect(mentorSelect).toHaveValue('all');
    expect(statusSelect).toHaveValue('all');
  });
});
