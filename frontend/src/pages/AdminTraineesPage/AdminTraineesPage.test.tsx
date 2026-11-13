import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { getAdminAnalytics, getAdminTrainees } from '../../api/admin';
import { downloadCsv } from '../../lib/downloadCsv';
import { buildAdminAnalytics, buildAdminTrainees } from '../../test/fixtures/admin';
import { ToastProvider } from '../../components/Toast/Toast';
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
  getAdminAnalytics: vi.fn(),
  createAdminTrainee: vi.fn(),
}));
vi.mock('../../lib/downloadCsv', () => ({
  downloadCsv: vi.fn(),
  csvFilename: () => 'vinkup-trainees-test.csv',
}));

const trainees = buildAdminTrainees();

beforeEach(() => {
  vi.mocked(getAdminTrainees).mockResolvedValue(trainees);
  vi.mocked(getAdminAnalytics).mockImplementation((query) =>
    Promise.resolve(buildAdminAnalytics(query)!)
  );
  vi.mocked(downloadCsv).mockReset();
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
  await screen.findByText('Days completed'); // analytics loaded
}

/** Names in the table, top to bottom. */
function tableNames(): string[] {
  const table = screen.getByRole('table', { name: 'Trainees' });
  return within(table)
    .getAllByRole('link')
    .map((link) => link.textContent ?? '');
}

describe('AdminTraineesPage with team analytics', () => {
  it('shows the analytics between the summary cards and the trainee table', async () => {
    await renderPage();

    const analytics = screen.getByRole('heading', { name: 'Team analytics' });
    const table = screen.getByRole('table', { name: 'Trainees' });
    const cards = screen.getByText('Average progress');

    // DOCUMENT_POSITION_FOLLOWING (4): the second node comes after the first.
    expect(
      cards.compareDocumentPosition(analytics) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      analytics.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('still searches the table, without changing the analytics trainee list', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search trainees' }), 'priya');

    expect(tableNames()).toEqual(['Priya Nair']);
    // The analytics trainee filter still offers everyone ("Whole team" + every trainee).
    expect(within(screen.getByLabelText('Trainee')).getAllByRole('option')).toHaveLength(
      trainees.length + 1
    );
  });

  it('still sorts the table', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'progress');

    // Least progress first.
    const byProgress = [...trainees]
      .sort((a, b) => a.daysCompleted - b.daysCompleted || a.name.localeCompare(b.name))
      .map((t) => t.name);
    expect(tableNames()).toEqual(byProgress);
  });

  it('still exports exactly the rows the table shows', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByRole('searchbox', { name: 'Search trainees' }), 'priya');
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const csv = vi.mocked(downloadCsv).mock.calls[0][0];
    expect(csv).toContain('Priya Nair');
    expect(csv).not.toContain('Rahul Sharma');
  });

  it('keeps the table as it is when an analytics filter changes', async () => {
    const user = userEvent.setup();
    await renderPage();
    const before = tableNames();

    await user.selectOptions(screen.getByLabelText('Trainee'), trainees[0].id);
    await user.selectOptions(screen.getByLabelText('Period'), '7');

    await waitFor(() =>
      expect(getAdminAnalytics).toHaveBeenLastCalledWith(
        expect.objectContaining({ traineeId: trainees[0].id })
      )
    );
    expect(tableNames()).toEqual(before);
  });

  it('counts the same trainees in the attention chip and the analytics list', async () => {
    await renderPage();

    const chip = screen.getByRole('button', { name: /^Needs attention \((\d+)\)$/ });
    const count = Number(/\((\d+)\)/.exec(chip.getAttribute('aria-label') ?? '')?.[1]);
    const list = screen.getByRole('heading', { name: 'Needs attention' }).closest('figure')!;

    expect(within(list).getByText(`${count} of ${trainees.length} trainees`)).toBeInTheDocument();
  });
});
