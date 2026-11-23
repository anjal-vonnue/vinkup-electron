import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { getAdminAnalytics, getAdminTrainee, getAdminTrainees } from '../../api/admin';
import { downloadCsv } from '../../lib/downloadCsv';
import {
  buildAdminAnalytics,
  buildAdminTraineeDetail,
  buildAdminTrainees,
} from '../../test/fixtures/admin';
import { ToastProvider } from '../../components/Toast/Toast';
import { RealtimeProvider } from '../../context/RealtimeProvider';
import { installFakeEventSource } from '../../test/fakeEventSource';
import AdminTraineesPage from './AdminTraineesPage';

vi.mock('../../context/Useauth', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', name: 'Mentor One', email: 'mentor@vonnue.com', role: 'admin' },
    isLoading: false,
    logout: vi.fn(),
  }),
}));
vi.mock('../../api/admin', () => ({
  getAdminTrainees: vi.fn(),
  getAdminTrainee: vi.fn(),
  getAdminAnalytics: vi.fn(),
  createAdminTrainee: vi.fn(),
}));
vi.mock('../../lib/downloadCsv', () => ({
  downloadCsv: vi.fn(),
  csvFilename: () => 'vinkup-trainees-test.csv',
}));

const trainees = buildAdminTrainees();
const traineesWithPendingReviews = trainees.map((trainee, index) =>
  index === 0
    ? {
        ...trainee,
        pendingReviewItems: [
          {
            taskId: 'html-day-01-t-1',
            taskTitle: 'Structure a Personal Portfolio',
            dayId: 'html-day-01',
            courseTitle: 'HTML & Semantic Web',
            dayNumber: 1,
            lastSubmittedAt: '2026-11-19T10:00:00.000Z',
          },
        ],
      }
    : trainee
);

beforeEach(() => {
  vi.mocked(getAdminTrainees).mockResolvedValue(traineesWithPendingReviews);
  vi.mocked(getAdminTrainee).mockImplementation((id) => {
    const found = buildAdminTraineeDetail(id);
    return found ? Promise.resolve(found) : Promise.reject(new Error('Missing trainee'));
  });
  vi.mocked(getAdminAnalytics).mockImplementation((query) =>
    Promise.resolve(buildAdminAnalytics(query)!)
  );
  vi.mocked(downloadCsv).mockReset();
  vi.mocked(getAdminAnalytics).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderPage() {
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <ToastProvider>
        <AdminTraineesPage />
      </ToastProvider>
    </MemoryRouter>
  );
  await screen.findByRole('table', { name: 'Trainees' });
}

/** Names in the table, top to bottom. */
function tableNames(): string[] {
  const table = screen.getByRole('table', { name: 'Trainees' });
  return within(table)
    .getAllByRole('link')
    .map((link) => link.textContent ?? '');
}

describe('AdminTraineesPage: Dashboard view / Team performance', () => {
  it('opens on the dashboard view: summary cards and table, no analytics', async () => {
    await renderPage();

    expect(screen.getByRole('tab', { name: 'Dashboard view' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('Average progress')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Team analytics' })).not.toBeInTheDocument();
    expect(getAdminAnalytics).not.toHaveBeenCalled();
  });

  it('shows submitted tasks waiting for review with a direct review link', async () => {
    const user = userEvent.setup();
    await renderPage();

    await screen.findByRole('table', { name: 'Trainees' });
    expect(screen.getByText('Pending review')).toBeInTheDocument();
    const pending = screen.getByLabelText('Pending review').closest('section')!;
    await user.click(within(pending).getByRole('button', { name: /View trainees/ }));
    const links = within(pending).getAllByRole('link', { name: /Review .* pending task/ });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0].getAttribute('href')).toMatch(/^\/admin\/trainees\/.*\?filter=pending$/);
    expect(within(pending).getAllByText(/waiting for review/).length).toBeGreaterThan(0);
  });

  it('shows only the team analytics on the Team performance view', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByRole('tab', { name: 'Team performance' }));

    expect(screen.getByRole('tab', { name: 'Team performance' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(await screen.findByText('Days completed')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Trainees' })).not.toBeInTheDocument();
    expect(screen.queryByText('Average progress')).not.toBeInTheDocument();
  });

  it('keeps the table search when switching views and back', async () => {
    const user = userEvent.setup();
    await renderPage();
    await user.type(screen.getByRole('searchbox', { name: 'Search trainees' }), 'priya');

    await user.click(screen.getByRole('tab', { name: 'Team performance' }));
    await screen.findByText('Days completed');
    await user.click(screen.getByRole('tab', { name: 'Dashboard view' }));

    expect(tableNames()).toEqual(['Priya Nair']);
  });

  it('counts the same trainees in the attention chip and the analytics list', async () => {
    const user = userEvent.setup();
    await renderPage();
    const chip = screen.getByRole('button', { name: /^Needs attention \((\d+)\)$/ });
    const count = Number(/\((\d+)\)/.exec(chip.getAttribute('aria-label') ?? '')?.[1]);

    await user.click(screen.getByRole('tab', { name: 'Team performance' }));
    await screen.findByText('Days completed');
    const list = screen.getByRole('heading', { name: 'Needs attention' }).closest('figure')!;

    expect(within(list).getByText(`${count} of ${trainees.length} trainees`)).toBeInTheDocument();
  });
});

describe('AdminTraineesPage: the table still works', () => {
  it('searches the table', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search trainees' }), 'priya');

    expect(tableNames()).toEqual(['Priya Nair']);
  });

  it('sorts the table', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'progress');

    // Least progress first.
    const byProgress = [...trainees]
      .sort((a, b) => a.daysCompleted - b.daysCompleted || a.name.localeCompare(b.name))
      .map((t) => t.name);
    expect(tableNames()).toEqual(byProgress);
  });

  it('exports exactly the rows the table shows', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search trainees' }), 'priya');
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const csv = vi.mocked(downloadCsv).mock.calls[0][0];
    expect(csv).toContain('Priya Nair');
    expect(csv).not.toContain('Rahul Sharma');
  });
});

describe('AdminTraineesPage: realtime', () => {
  async function renderWithStream() {
    const fake = installFakeEventSource();

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <ToastProvider>
          <RealtimeProvider enabled>
            <AdminTraineesPage />
          </RealtimeProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    await screen.findByRole('table', { name: 'Trainees' });
    expect(getAdminTrainees).toHaveBeenCalledTimes(1);
    return fake;
  }

  it('reloads the list when a task starts', async () => {
    const fake = await renderWithStream();

    act(() => {
      fake.source?.emit({
        type: 'task.started',
        traineeId: trainees[0].id,
        taskId: 'task-1',
        startedAt: '2026-11-18T10:00:00.000Z',
      });
    });

    await waitFor(() => expect(getAdminTrainees).toHaveBeenCalledTimes(2));
  });

  it('reloads the list when a flag is created', async () => {
    const fake = await renderWithStream();

    act(() => {
      fake.source?.emit({
        type: 'flag.created',
        traineeId: trainees[0].id,
        taskId: 'task-1',
        flagId: 'flag-1',
        timestamp: '2026-11-18T10:00:00.000Z',
      });
    });

    await waitFor(() => expect(getAdminTrainees).toHaveBeenCalledTimes(2));
  });

  it('reloads the list when a trainee is reassigned', async () => {
    const fake = await renderWithStream();

    act(() => {
      fake.source?.emit({
        type: 'trainee.reassigned',
        traineeId: trainees[0].id,
        traineeName: trainees[0].name,
        previousMentorId: 'mentor-1',
        mentorId: 'mentor-2',
        changedAt: '2026-11-18T10:00:00.000Z',
      });
    });

    await waitFor(() => expect(getAdminTrainees).toHaveBeenCalledTimes(2));
  });
});
