import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { clear, keys } from 'idb-keyval';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { DayCurrentStatus, DayTask, DayIntegrityResponse } from '@itp/types';
import { ApiError } from '../../api/errors';
import { mockDayContents } from '../../api/dayOverview';
import {
  completeDay,
  getDayJournal,
  getDayStatus,
  getDayTasks,
  saveJournal,
  getDayIntegrity,
} from '../../api/days';
import { getTaskReview } from '../../api/tasks';
import { markTaskCommentRead } from '../../api/dashboard';
import { RealtimeProvider } from '../../context/RealtimeProvider';
import { installFakeEventSource } from '../../test/fakeEventSource';
import DayOverviewPage from './DayOverviewPage';

vi.mock('../../api/days');
vi.mock('../../api/tasks');
vi.mock('../../api/dashboard', () => ({
  markTaskCommentRead: vi.fn().mockResolvedValue(undefined),
}));
// The header needs providers we don't care about here.
vi.mock('../../components/Header', () => ({ default: () => null }));
// The self-check checklist stores its ticks per trainee, so it needs a user.
vi.mock('../../context/Useauth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'a@vonnue.com', name: 'A' },
    isLoading: false,
  }),
}));

const dayId = Object.keys(mockDayContents)[0];

const completedTask = {
  id: 't-1',
  title: 'Required task',
  status: 'completed' as const,
  isStretchGoal: false,
} as DayTask;

const integrityResponse = {
  state: 'in_progress',
  score: 31,
  tasksCounted: 2,
  breakdown: { pasteAttempts: 0, tabSwitches: 3, fullscreenExits: 1, windowBlurs: 0 },
} as DayIntegrityResponse;

const openStatus = { isLocked: false, isCompleted: false } as DayCurrentStatus;

function renderPage() {
  return render(
    <RealtimeProvider enabled>
      <MemoryRouter initialEntries={[`/days/${dayId}`]}>
        <Routes>
          <Route path="/days/:dayId" element={<DayOverviewPage />} />
        </Routes>
      </MemoryRouter>
    </RealtimeProvider>
  );
}

/** Waits for the page to load, then returns the journal's textarea. */
async function findJournalTextarea() {
  await screen.findByRole('button', { name: /save journal/i });
  return screen.getByRole('textbox');
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(markTaskCommentRead).mockResolvedValue(undefined);
  vi.mocked(getDayTasks).mockResolvedValue([completedTask]);
  vi.mocked(getDayStatus).mockResolvedValue(openStatus);
  vi.mocked(getDayJournal).mockResolvedValue({ responseText: null });
  vi.mocked(getDayIntegrity).mockResolvedValue(integrityResponse);
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await clear(); // ticks from one test must not leak into the next
});

describe('DayOverviewPage: loading', () => {
  it('loads the tasks, status and journal for the day in the URL', async () => {
    renderPage();

    await screen.findByRole('button', { name: /submit day/i });

    expect(getDayTasks).toHaveBeenCalledWith(dayId);
    expect(getDayStatus).toHaveBeenCalledWith(dayId);
    expect(getDayJournal).toHaveBeenCalledWith(dayId);
    expect(getDayIntegrity).toHaveBeenCalledWith(dayId);
  });

  it('shows the locked message when the status says the day is locked', async () => {
    vi.mocked(getDayStatus).mockResolvedValue({ ...openStatus, isLocked: true });
    renderPage();

    expect(await screen.findByText('This day is locked')).toBeInTheDocument();
  });

  it('shows the locked message when the API answers DAY_LOCKED', async () => {
    vi.mocked(getDayTasks).mockRejectedValue(
      new ApiError(403, 'DAY_LOCKED', "This day isn't unlocked yet.")
    );
    renderPage();

    expect(await screen.findByText('This day is locked')).toBeInTheDocument();
  });

  it('shows a generic error when loading fails', async () => {
    vi.mocked(getDayStatus).mockRejectedValue(
      new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
    );
    renderPage();

    expect(await screen.findByText("Couldn't load this day")).toBeInTheDocument();
  });
});

describe('DayOverviewPage: review status', () => {
  const approvedTask = {
    ...completedTask,
    id: 't-approved',
    title: 'Approved task',
    reviewStatus: 'approved' as const,
  };
  const pendingTask = {
    ...completedTask,
    id: 't-pending',
    title: 'Pending task',
    reviewStatus: 'pending' as const,
  };
  const reworkTask = {
    ...completedTask,
    id: 't-rework',
    title: 'Rework task',
    reviewStatus: 'rework' as const,
  };

  it('shows Approved, Completed and Rework tags on submitted tasks', async () => {
    vi.mocked(getDayTasks).mockResolvedValue([approvedTask, pendingTask, reworkTask]);
    renderPage();

    expect(await screen.findByText('Approved task')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Rework')).toBeInTheDocument();
  });

  it('updates the tag when a review arrives over the realtime stream', async () => {
    const fake = installFakeEventSource();
    vi.mocked(getDayTasks).mockResolvedValueOnce([pendingTask]).mockResolvedValue([approvedTask]);

    renderPage();

    expect(await screen.findByText('Completed')).toBeInTheDocument();

    act(() => {
      fake.source?.emit({
        type: 'task.reviewed',
        taskId: pendingTask.id,
        taskTitle: pendingTask.title,
        decision: 'approved',
        reviewStatus: 'approved',
        submissionNo: 1,
        feedback: '',
        mentorName: 'Mentor Maya',
        reviewedAt: '2026-11-18T10:00:00.000Z',
      });
    });

    expect(await screen.findByText('Approved')).toBeInTheDocument();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it('opens the feedback modal when the Rework tag is clicked', async () => {
    vi.mocked(getDayTasks).mockResolvedValue([reworkTask]);
    vi.mocked(getTaskReview).mockResolvedValue({
      reviewStatus: 'rework',
      submissionCount: 2,
      latestReview: {
        id: 'rev-1',
        taskId: reworkTask.id,
        adminId: 'admin-1',
        adminName: 'Mentor Jane',
        submissionNo: 2,
        decision: 'rework',
        feedback: 'Please fix the heading hierarchy.',
        reviewedAt: '2026-11-12T10:00:00.000Z',
      },
    });
    renderPage();

    await screen.findByText('Rework task');
    fireEvent.click(screen.getByText('Rework'));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('Please fix the heading hierarchy.')).toBeInTheDocument();
    expect(screen.getByText('Reviewed by Mentor Jane')).toBeInTheDocument();
    expect(getTaskReview).toHaveBeenCalledWith(reworkTask.id);
  });

  it('opens an approved task suggestion from its separate row action', async () => {
    const suggestedTask = {
      ...approvedTask,
      mentorSuggestion: { adminName: 'Mentor Jane', feedback: 'Consider adding a footer.' },
    };
    vi.mocked(getDayTasks).mockResolvedValue([suggestedTask]);
    vi.mocked(getTaskReview).mockResolvedValue({
      reviewStatus: 'approved',
      submissionCount: 1,
      latestReview: {
        id: 'rev-approved',
        taskId: suggestedTask.id,
        adminId: 'admin-1',
        adminName: 'Mentor Jane',
        submissionNo: 1,
        decision: 'approved',
        feedback: 'Consider adding a footer.',
        reviewedAt: '2026-11-12T10:00:00.000Z',
      },
    });
    renderPage();

    await screen.findByText('Approved task');
    expect(screen.getByText('Approved').closest('[role="button"]')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'View mentor suggestion for Approved task' })
    );

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('Consider adding a footer.')).toBeInTheDocument();
    expect(screen.getByText('Mentor suggestion')).toBeInTheDocument();
    expect(getTaskReview).toHaveBeenCalledWith(suggestedTask.id);
  });
});

describe('DayOverviewPage: completing the day', () => {
  it('calls completeDay and shows "Day completed" on success', async () => {
    vi.mocked(completeDay).mockResolvedValue({ ...openStatus, isCompleted: true });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /submit day/i }));

    expect(completeDay).toHaveBeenCalledWith(dayId);
    expect(await screen.findByText('Day completed')).toBeInTheDocument();
    const successHeading = await screen.findByRole('heading', { name: 'Day submitted!' });
    expect(successHeading.closest('[role="status"]')).toHaveAttribute('aria-live', 'polite');
  });

  it('does not celebrate while the request is pending and ignores repeat clicks', async () => {
    vi.mocked(completeDay).mockImplementation(() => new Promise(() => {}));
    renderPage();

    const submitButton = await screen.findByRole('button', { name: /submit day/i });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(completeDay).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: /submitting/i })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: 'Day submitted!' })).not.toBeInTheDocument();
  });

  it('shows the server message when completion fails', async () => {
    vi.mocked(completeDay).mockRejectedValue(
      new ApiError(400, 'CHECKLIST_INCOMPLETE', 'Check all required items before submitting.')
    );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /submit day/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Check all required items before submitting.'
    );
    expect(screen.queryByRole('heading', { name: 'Day submitted!' })).not.toBeInTheDocument();
  });

  it('allows a failed submission to be retried and celebrates only the successful attempt', async () => {
    vi.mocked(completeDay)
      .mockRejectedValueOnce(new Error('Please try again.'))
      .mockResolvedValueOnce({ ...openStatus, isCompleted: true });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /submit day/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please try again.');
    expect(screen.queryByRole('heading', { name: 'Day submitted!' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /submit day/i }));

    const successHeading = await screen.findByRole('heading', { name: 'Day submitted!' });
    expect(successHeading.closest('[role="status"]')).toHaveAttribute('aria-live', 'polite');
    expect(completeDay).toHaveBeenCalledTimes(2);
  });

  it('disables the button when a required task is not completed', async () => {
    vi.mocked(getDayTasks).mockResolvedValue([
      { ...completedTask, status: 'not_started' } as unknown as DayTask,
    ]);
    renderPage();

    expect(await screen.findByRole('button', { name: /submit day/i })).toBeDisabled();
  });
});

describe('DayOverviewPage: daily journal', () => {
  it('restores the saved journal text', async () => {
    vi.mocked(getDayJournal).mockResolvedValue({ responseText: 'Saved earlier' });
    renderPage();

    expect(await findJournalTextarea()).toHaveValue('Saved earlier');
  });

  it('starts empty when nothing is saved yet', async () => {
    renderPage();

    expect(await findJournalTextarea()).toHaveValue('');
  });

  it('starts empty when loading the journal fails, without breaking the page', async () => {
    vi.mocked(getDayJournal).mockRejectedValue(
      new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
    );
    renderPage();

    expect(await findJournalTextarea()).toHaveValue('');
  });

  it('keeps Save Journal disabled until the trainee types something', async () => {
    renderPage();

    const textarea = await findJournalTextarea();
    const saveButton = screen.getByRole('button', { name: /save journal/i });

    expect(saveButton).toBeDisabled();

    fireEvent.change(textarea, { target: { value: 'Some notes' } });

    expect(saveButton).toBeEnabled();
  });

  it('saves the text for this day and shows "Saved successfully"', async () => {
    vi.mocked(saveJournal).mockResolvedValue(undefined);
    renderPage();

    const textarea = await findJournalTextarea();
    fireEvent.change(textarea, { target: { value: 'Learned Prisma' } });
    fireEvent.click(screen.getByRole('button', { name: /save journal/i }));

    expect(saveJournal).toHaveBeenCalledWith(dayId, 'Learned Prisma');
    expect(await screen.findByText('Saved successfully')).toBeInTheDocument();
  });

  it('shows an error and no success message when saving fails', async () => {
    vi.mocked(saveJournal).mockRejectedValue(
      new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
    );
    renderPage();

    // The button is disabled while the journal is empty, so type first.
    const textarea = await findJournalTextarea();
    fireEvent.change(textarea, { target: { value: 'Some notes' } });
    fireEvent.click(screen.getByRole('button', { name: /save journal/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.'
    );
    expect(screen.queryByText('Saved successfully')).not.toBeInTheDocument();
  });

  it('does not call the API when the journal is only whitespace', async () => {
    renderPage();

    const textarea = await findJournalTextarea();
    fireEvent.change(textarea, { target: { value: '    ' } });
    fireEvent.click(screen.getByRole('button', { name: /save journal/i }));

    expect(saveJournal).not.toHaveBeenCalled();
  });
});

describe('DayOverviewPage: self-check checklist', () => {
  it('keeps ticked items after leaving the page and coming back', async () => {
    const first = renderPage();
    await screen.findByRole('button', { name: /submit day/i });

    // Checkboxes stay disabled until the saved state has loaded.
    const checkbox = screen.getAllByRole('checkbox')[0];
    await waitFor(() => expect(checkbox).toBeEnabled());
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    // Make sure the write has reached IndexedDB before "leaving" the page.
    await waitFor(async () => expect(await keys()).toHaveLength(1));
    first.unmount();

    renderPage();
    await screen.findByRole('button', { name: /submit day/i });

    await waitFor(() => expect(screen.getAllByRole('checkbox')[0]).toBeChecked());
  });
});
