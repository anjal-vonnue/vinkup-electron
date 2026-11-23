import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import type {
  AdminFeedbackEntry,
  AdminFlagEvent,
  AdminTraineeDetail,
  TaskReview,
} from '@itp/types';

import AdminTraineePage from './AdminTraineePage';
import {
  approveTask,
  getAdminFlags,
  getAdminTaskCode,
  getAdminTaskReviews,
  getAdminTrainee,
  getAdminTraineeFeedback,
} from '../../api/admin';
import { ApiError } from '../../api/errors';
import { RealtimeProvider } from '../../context/RealtimeProvider';
import { installFakeEventSource } from '../../test/fakeEventSource';
import { reportDocumentTitle } from '../../lib/printReport';
import {
  buildAdminFlags,
  buildAdminTaskCode,
  buildAdminTraineeDetail,
  mockAdmin,
  mockAdminTraineeIds,
} from '../../test/fixtures/admin';

vi.mock('../../context/Useauth', () => ({
  useAuth: () => ({
    user: mockAdmin,
    status: 'authenticated',
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('../../api/admin', () => ({
  getAdminTrainees: vi.fn(),
  getAdminTrainee: vi.fn(),
  getAdminFlags: vi.fn(),
  getAdminTaskCode: vi.fn(),
  getAdminTaskReviews: vi.fn(),
  getAdminTraineeFeedback: vi.fn(),
  approveTask: vi.fn(),
  requestRework: vi.fn(),
}));

const traineeId = mockAdminTraineeIds[0];
const detail = buildAdminTraineeDetail(traineeId) as AdminTraineeDetail;
// Arjun's mock flags mix High, Normal and Low events.
const flags = buildAdminFlags(mockAdminTraineeIds[2]) as AdminFlagEvent[];
const importantFlags = flags.filter((flag) => flag.reviewPriority !== 'LOW');
const feedbackEntries: AdminFeedbackEntry[] = [
  {
    id: 'fb-1',
    taskId: 'task-1',
    taskTitle: 'Semantic HTML',
    dayId: 'html-1',
    adminId: 'admin-1',
    adminName: 'Mentor Alice',
    submissionNo: 1,
    decision: 'rework',
    feedback: 'Add the meta viewport tag.',
    reviewedAt: '2026-10-10T10:00:00.000Z',
  },
];

function Jump({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate(to)}>
      jump
    </button>
  );
}

function renderPage(path = `/admin/trainees/${traineeId}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<p>Trainees list</p>} />
        <Route
          path="/admin/trainees/:traineeId"
          element={
            <>
              <AdminTraineePage />
              <Jump to="/admin/trainees/other-trainee" />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  document.title = 'Vinkup';
  delete document.documentElement.dataset.theme;
  vi.mocked(getAdminTrainee).mockResolvedValue(detail);
  vi.mocked(getAdminFlags).mockResolvedValue(flags);
  vi.mocked(getAdminTraineeFeedback).mockResolvedValue([]);
  vi.mocked(getAdminTaskReviews).mockResolvedValue([]);
  vi.mocked(getAdminTaskCode).mockImplementation((id, taskId) => {
    const result = buildAdminTaskCode(id, taskId);
    return result.kind === 'ok'
      ? Promise.resolve(result.data)
      : Promise.reject(new ApiError(404, 'NOT_FOUND', 'Task not found.'));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  delete window.desktop;
  document.title = '';
  delete document.documentElement.dataset.theme;
});

describe('AdminTraineePage', () => {
  it('shows a loader while the trainee loads, and asks for the right trainee', () => {
    vi.mocked(getAdminTrainee).mockImplementation(() => new Promise<AdminTraineeDetail>(() => {}));

    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading trainee');
    expect(getAdminTrainee).toHaveBeenCalledWith(traineeId);
  });

  it('shows the profile, statistics, daily activity and course grid, with a link back', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: detail.profile.trainee.name })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to trainees/ })).toHaveAttribute(
      'href',
      '/admin'
    );
    expect(screen.getByLabelText('Training statistics')).toBeInTheDocument();
    expect(screen.getByLabelText('Daily training activity')).toBeInTheDocument();
    expect(screen.getByLabelText('Course and day progress')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Journal/ })).toBeInTheDocument();
  });

  it('reloads the trainee when a resubmission arrives over the realtime stream', async () => {
    const fake = installFakeEventSource();

    render(
      <MemoryRouter initialEntries={[`/admin/trainees/${traineeId}`]}>
        <RealtimeProvider enabled>
          <Routes>
            <Route path="/admin/trainees/:traineeId" element={<AdminTraineePage />} />
          </Routes>
        </RealtimeProvider>
      </MemoryRouter>
    );

    await screen.findByRole('heading', { level: 1, name: detail.profile.trainee.name });
    expect(getAdminTrainee).toHaveBeenCalledTimes(1);

    act(() => {
      fake.source?.emit({
        type: 'task.submitted',
        traineeId,
        traineeName: 'Test Trainee',
        taskId: detail.tasks[0]?.taskId ?? 'task-1',
        taskTitle: detail.tasks[0]?.title ?? 'Profile page',
        submissionCount: 2,
        submittedAt: '2026-11-18T10:00:00.000Z',
      });
    });

    await waitFor(() => expect(getAdminTrainee).toHaveBeenCalledTimes(2));
  });

  it('reloads the trainee when a task moves to In progress', async () => {
    const fake = installFakeEventSource();

    render(
      <MemoryRouter initialEntries={[`/admin/trainees/${traineeId}`]}>
        <RealtimeProvider enabled>
          <Routes>
            <Route path="/admin/trainees/:traineeId" element={<AdminTraineePage />} />
          </Routes>
        </RealtimeProvider>
      </MemoryRouter>
    );

    await screen.findByRole('heading', { level: 1, name: detail.profile.trainee.name });
    expect(getAdminTrainee).toHaveBeenCalledTimes(1);

    act(() => {
      fake.source?.emit({
        type: 'task.started',
        traineeId,
        taskId: detail.tasks[0]?.taskId ?? 'task-1',
        startedAt: '2026-11-18T10:00:00.000Z',
      });
    });

    await waitFor(() => expect(getAdminTrainee).toHaveBeenCalledTimes(2));
  });

  it('reloads the flags when an integrity flag arrives', async () => {
    const fake = installFakeEventSource();

    render(
      <MemoryRouter initialEntries={[`/admin/trainees/${traineeId}`]}>
        <RealtimeProvider enabled>
          <Routes>
            <Route path="/admin/trainees/:traineeId" element={<AdminTraineePage />} />
          </Routes>
        </RealtimeProvider>
      </MemoryRouter>
    );

    await screen.findByRole('heading', { level: 1, name: detail.profile.trainee.name });
    expect(getAdminFlags).toHaveBeenCalledTimes(1);

    act(() => {
      fake.source?.emit({
        type: 'flag.created',
        traineeId,
        taskId: detail.tasks[0]?.taskId ?? 'task-1',
        flagId: 'flag-1',
        timestamp: '2026-11-18T10:00:00.000Z',
      });
    });

    await waitFor(() => expect(getAdminFlags).toHaveBeenCalledTimes(2));
  });

  it('shows that the trainee is no longer assigned after a reassignment', async () => {
    const fake = installFakeEventSource();
    vi.mocked(getAdminTrainee)
      .mockResolvedValueOnce(detail)
      .mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'Trainee not assigned to you.'));

    render(
      <MemoryRouter initialEntries={[`/admin/trainees/${traineeId}`]}>
        <RealtimeProvider enabled>
          <Routes>
            <Route path="/admin/trainees/:traineeId" element={<AdminTraineePage />} />
          </Routes>
        </RealtimeProvider>
      </MemoryRouter>
    );

    await screen.findByRole('heading', { level: 1, name: detail.profile.trainee.name });

    act(() => {
      fake.source?.emit({
        type: 'trainee.reassigned',
        traineeId,
        traineeName: detail.profile.trainee.name,
        previousMentorId: 'mentor-1',
        mentorId: 'mentor-2',
        changedAt: '2026-11-18T10:00:00.000Z',
      });
    });

    expect(await screen.findByText('Trainee not assigned to you')).toBeInTheDocument();
    expect(getAdminTrainee).toHaveBeenCalledTimes(2);
  });

  it('ignores events for another trainee', async () => {
    const fake = installFakeEventSource();

    render(
      <MemoryRouter initialEntries={[`/admin/trainees/${traineeId}`]}>
        <RealtimeProvider enabled>
          <Routes>
            <Route path="/admin/trainees/:traineeId" element={<AdminTraineePage />} />
          </Routes>
        </RealtimeProvider>
      </MemoryRouter>
    );

    await screen.findByRole('heading', { level: 1, name: detail.profile.trainee.name });

    act(() => {
      fake.source?.emit({
        type: 'task.started',
        traineeId: 'another-trainee',
        taskId: 'task-9',
        startedAt: '2026-11-18T10:00:00.000Z',
      });
    });

    expect(getAdminTrainee).toHaveBeenCalledTimes(1);
    expect(getAdminFlags).toHaveBeenCalledTimes(1);
  });

  it('opens on the task list, with View code for every submitted task', async () => {
    renderPage();

    const panel = await screen.findByRole('tabpanel');
    expect(screen.getByRole('tab', { name: /^Tasks/ })).toHaveAttribute('aria-selected', 'true');
    // In-progress tasks are listed, but their unfinished code cannot be opened.
    const submitted = detail.tasks.filter((task) => task.status === 'completed');
    expect(within(panel).getAllByRole('button', { name: /^View code for/ }).length).toBe(
      submitted.length
    );
  });

  it('shows journal responses on the Journal tab', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('tab', { name: /^Journal/ }));

    const entries = within(screen.getByRole('tabpanel')).getAllByRole('article');
    expect(entries).toHaveLength(detail.journal.length);
    expect(entries[0]).toHaveTextContent(detail.journal[0].responseText.replace(/\s+/g, ' '));
  });

  it('shows the important flags newest first with their review priority', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('tab', { name: /^Flags/ }));

    const rows = (await screen.findAllByRole('row')).slice(1);
    expect(rows).toHaveLength(importantFlags.length);
    expect(flags.length).toBeGreaterThan(importantFlags.length);
    const newest = [...importantFlags].sort(
      (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)
    )[0];
    expect(within(rows[0]).getByText(newest.taskTitle)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/^(Normal|High)$/)).toBeInTheDocument();
    expect(getAdminFlags).toHaveBeenCalledWith(traineeId);

    await user.click(screen.getByRole('button', { name: `All (${flags.length})` }));

    expect(screen.getAllByRole('row').slice(1)).toHaveLength(flags.length);
  });

  it('counts only the important flags on the tab', async () => {
    renderPage();

    expect(
      await screen.findByRole('tab', { name: `Flags (${importantFlags.length})` })
    ).toBeInTheDocument();
  });

  it('shows review feedback on the Feedbacks tab, newest feedback first', async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminTraineeFeedback).mockResolvedValue(feedbackEntries);
    renderPage();

    await user.click(await screen.findByRole('tab', { name: /^Feedbacks/ }));

    const panel = screen.getByRole('tabpanel');
    expect(await within(panel).findByText('Semantic HTML')).toBeInTheDocument();
    expect(within(panel).getByText('Add the meta viewport tag.')).toBeInTheDocument();
    expect(within(panel).getByText('Mentor Alice')).toBeInTheDocument();
    expect(getAdminTraineeFeedback).toHaveBeenCalledWith(traineeId);
  });

  it('shows the empty state on the Feedbacks tab when nothing has been reviewed', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('tab', { name: /^Feedbacks/ }));

    expect(await screen.findByText('No review feedback yet')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Feedbacks (0)' })).toBeInTheDocument();
  });

  it('opens submitted code read-only, and offers no editing, running or saving', async () => {
    const user = userEvent.setup();
    renderPage();

    const completed = detail.tasks.find((task) => task.status === 'completed');
    if (!completed) throw new Error('fixture trainee has no completed task');

    await user.click(
      await screen.findByRole('button', { name: `View code for ${completed.title}` })
    );

    expect(getAdminTaskCode).toHaveBeenCalledWith(traineeId, completed.taskId);
    const viewer = await screen.findByRole('region', { name: completed.title });
    const firstFile = (await within(viewer).findAllByRole('treeitem')).find(
      (row) => row.getAttribute('aria-expanded') === null
    );
    if (!firstFile) throw new Error('submitted task has no file row');
    await user.click(firstFile);
    expect(await within(viewer).findByText('Read only')).toBeInTheDocument();
    expect(
      within(viewer).queryByRole('button', { name: /run|save|reset|submit/i })
    ).not.toBeInTheDocument();
    expect(within(viewer).getAllByLabelText(/\(read-only\)$/).length).toBeGreaterThan(0);
  });

  it('says when an opened task still has only starter code', async () => {
    const user = userEvent.setup();
    const task = detail.tasks.find((row) => row.status === 'completed') ?? detail.tasks[0];
    vi.mocked(getAdminTaskCode).mockResolvedValue({
      taskId: task.taskId,
      title: task.title,
      sequenceOrder: task.sequenceOrder,
      instructionsMarkdown: 'Complete the task.',
      status: 'in_progress',
      reviewStatus: null,
      submissionCount: 0,
      isStarterCode: true,
      files: [{ path: 'index.html', content: '<!-- starter -->' }],
      codeUpdatedAt: null,
      lastSubmittedAt: null,
    });
    renderPage();

    await user.click(await screen.findByRole('button', { name: `View code for ${task.title}` }));

    expect(await screen.findByRole('note')).toHaveTextContent(/hasn.t saved any work/);
  });

  it('closes the code viewer', async () => {
    const user = userEvent.setup();
    renderPage();
    const task = detail.tasks.find((row) => row.status === 'completed') ?? detail.tasks[0];

    await user.click(
      await screen.findByRole('button', {
        name: `View code for ${task.title}`,
      })
    );
    await user.click(await screen.findByRole('button', { name: 'Close code viewer' }));

    expect(screen.queryByRole('region', { name: task.title })).not.toBeInTheDocument();
  });

  it('closes the code viewer after the mentor approves the task', async () => {
    const user = userEvent.setup();
    vi.mocked(approveTask).mockResolvedValue({} as TaskReview);
    renderPage();
    const task = detail.tasks.find((row) => row.status === 'completed') ?? detail.tasks[0];

    await user.click(await screen.findByRole('button', { name: `View code for ${task.title}` }));
    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(approveTask).toHaveBeenCalledWith(traineeId, task.taskId);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Close code viewer' })).not.toBeInTheDocument()
    );
  });

  it('goes back to the same place in the list after an approval, without a loader', async () => {
    const user = userEvent.setup();
    vi.mocked(approveTask).mockResolvedValue({} as TaskReview);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(800);
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    renderPage();
    const task = detail.tasks.find((row) => row.status === 'completed') ?? detail.tasks[0];

    await user.click(await screen.findByRole('button', { name: `View code for ${task.title}` }));
    // The reload after the approval never finishes, so a loader would stay on screen.
    vi.mocked(getAdminTrainee).mockReturnValue(new Promise(() => {}));
    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 800 }));
    expect(screen.queryByText('Loading trainee…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `View code for ${task.title}` })).toBeInTheDocument();
  });

  it('keeps the chosen task filter after a review reloads the page', async () => {
    const user = userEvent.setup();
    vi.mocked(approveTask).mockResolvedValue({} as TaskReview);
    renderPage();
    const task = detail.tasks.find((row) => row.status === 'completed') ?? detail.tasks[0];

    await user.click(await screen.findByRole('button', { name: /^Pending review \(/ }));
    await user.click(await screen.findByRole('button', { name: `View code for ${task.title}` }));
    await user.click(await screen.findByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Close code viewer' })).not.toBeInTheDocument()
    );
    expect(await screen.findByRole('button', { name: /^Pending review \(/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it.each([
    ['NOT_FOUND', 404],
    ['VALIDATION_FAILED', 400],
  ] as const)('shows "Trainee not found" for a %s answer', async (code, status) => {
    vi.mocked(getAdminTrainee).mockRejectedValue(new ApiError(status, code, 'nope'));

    renderPage('/admin/trainees/not-a-uuid');

    expect(await screen.findByRole('heading', { name: 'Trainee not found' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to trainees' })).toHaveAttribute(
      'href',
      '/admin'
    );
  });

  it('shows an error with a retry for any other failure, and loads again on retry', async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminTrainee)
      .mockRejectedValueOnce(
        new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
      )
      .mockResolvedValueOnce(detail);

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load trainee');
    expect(screen.getByRole('link', { name: /Back to trainees/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: detail.profile.trainee.name })
    ).toBeInTheDocument();
    expect(getAdminTrainee).toHaveBeenCalledTimes(2);
  });

  it('explains a trainee who is no longer assigned to this mentor', async () => {
    vi.mocked(getAdminTrainee).mockRejectedValue(
      new ApiError(403, 'FORBIDDEN', 'This trainee is not assigned to you.')
    );

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Trainee not assigned to you' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to my trainees' })).toHaveAttribute(
      'href',
      '/admin'
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('keeps the rest of the page when only the flags fail to load', async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminFlags).mockRejectedValueOnce(
      new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
    );

    renderPage();

    await user.click(await screen.findByRole('tab', { name: /^Flags/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load flags');
    expect(
      screen.getByRole('heading', { level: 1, name: detail.profile.trainee.name })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByRole('row')).not.toHaveLength(0);
  });

  it("never shows one trainee's data under another trainee's link", async () => {
    const user = userEvent.setup();
    vi.mocked(getAdminTrainee).mockImplementation((id) =>
      id === traineeId ? Promise.resolve(detail) : new Promise<AdminTraineeDetail>(() => {})
    );
    renderPage();
    await screen.findByRole('heading', { level: 1, name: detail.profile.trainee.name });

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'jump' }));
    });

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(screen.queryByText(detail.profile.trainee.name)).not.toBeInTheDocument();
    expect(getAdminTrainee).toHaveBeenLastCalledWith('other-trainee');
  });

  it('prints a report in the browser when the desktop app is unavailable', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const user = userEvent.setup();
    document.documentElement.dataset.theme = 'dark';
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Print report' }));
    const dialog = screen.getByRole('dialog', { name: 'Print report' });
    await user.click(within(dialog).getByRole('checkbox', { name: 'Journal entries' }));
    await user.click(within(dialog).getByRole('button', { name: 'Print' }));

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(document.title).toBe(reportDocumentTitle(detail.profile.trainee.name));
    expect(document.documentElement.dataset.theme).toBe('dark');
    const report = screen.getByRole('article', { name: 'Printable trainee report' });
    expect(
      within(report).getByRole('heading', { level: 1, name: detail.profile.trainee.name })
    ).toBeInTheDocument();
    expect(report).toHaveTextContent(/Prepared by\s*Mock Mentor/);
    expect(within(report).queryByRole('heading', { name: /^Journal/ })).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });

    // Kept mounted (hidden on screen) so a print snapshot taken after `afterprint` is not blank.
    // The next print replaces it.
    const retained = screen.getByRole('article', { name: 'Printable trainee report' });
    expect(
      within(retained).getByRole('heading', { level: 1, name: detail.profile.trainee.name })
    ).toBeInTheDocument();
    expect(within(retained).queryByRole('heading', { name: /^Journal/ })).not.toBeInTheDocument();
    expect(document.title).toBe('Vinkup');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('renders the default report when printing starts from the browser menu', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: detail.profile.trainee.name });
    document.documentElement.dataset.theme = 'dark';

    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });

    const report = screen.getByRole('article', {
      name: 'Printable trainee report',
    });

    expect(within(report).queryByRole('heading', { name: /^Journal/ })).not.toBeInTheDocument();

    expect(within(report).getByRole('heading', { name: 'Focus events' })).toBeInTheDocument();

    expect(document.title).toBe(reportDocumentTitle(detail.profile.trainee.name));

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });

    expect(document.title).toBe('Vinkup');
    expect(screen.getByRole('article', { name: 'Printable trainee report' })).toBeInTheDocument();
  });

  it('saves the selected trainee report as a PDF through the desktop app', async () => {
    const user = userEvent.setup();
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    let resolveSave: (saved: boolean) => void = () => undefined;
    const savePdf = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve;
        })
    );
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: { report: { savePdf } },
    });
    document.documentElement.dataset.theme = 'dark';

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Print report' }));
    const dialog = screen.getByRole('dialog', { name: 'Print report' });
    await user.click(within(dialog).getByRole('checkbox', { name: 'Journal entries' }));
    await user.click(within(dialog).getByRole('button', { name: 'Print' }));

    await waitFor(() => expect(savePdf).toHaveBeenCalledTimes(1));
    expect(savePdf).toHaveBeenCalledWith(reportDocumentTitle(detail.profile.trainee.name));
    expect(printSpy).not.toHaveBeenCalled();
    expect(document.title).toBe(reportDocumentTitle(detail.profile.trainee.name));
    expect(document.documentElement.dataset.theme).toBe('dark');

    const report = screen.getByRole('article', { name: 'Printable trainee report' });
    expect(
      within(report).getByRole('heading', { level: 1, name: detail.profile.trainee.name })
    ).toBeInTheDocument();
    expect(within(report).queryByRole('heading', { name: /^Journal/ })).not.toBeInTheDocument();

    await act(async () => {
      resolveSave(true);
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(
        screen.queryByRole('article', { name: 'Printable trainee report' })
      ).not.toBeInTheDocument()
    );
    expect(document.title).toBe('Vinkup');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('restores the page quietly when the PDF save dialog is cancelled', async () => {
    const user = userEvent.setup();
    const savePdf = vi.fn().mockResolvedValue(false);
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: { report: { savePdf } },
    });

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Print report' }));
    await user.click(screen.getByRole('button', { name: 'Print' }));

    await waitFor(() => expect(savePdf).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.queryByRole('article', { name: 'Printable trainee report' })
      ).not.toBeInTheDocument()
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.title).toBe('Vinkup');
  });

  it('explains a failed PDF export and restores the page', async () => {
    const user = userEvent.setup();
    const savePdf = vi.fn().mockRejectedValue(new Error('Disk is full'));
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: { report: { savePdf } },
    });
    document.documentElement.dataset.theme = 'dark';

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Print report' }));
    await user.click(screen.getByRole('button', { name: 'Print' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to save report PDF: Disk is full'
    );
    expect(
      screen.queryByRole('article', { name: 'Printable trainee report' })
    ).not.toBeInTheDocument();
    expect(document.title).toBe('Vinkup');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
