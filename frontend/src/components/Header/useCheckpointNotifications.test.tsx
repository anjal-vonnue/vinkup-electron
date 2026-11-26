import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TraineeCheckpointSummary } from '@itp/types';
import { MemoryRouter } from 'react-router';
import { RealtimeProvider } from '../../context/RealtimeProvider';
import { installFakeEventSource, type FakeEventSourceHandle } from '../../test/fakeEventSource';
import { getMyCheckpoints } from '../../api/checkpoints';
import { useCheckpointNotifications } from './useCheckpointNotifications';

vi.mock('../../api/checkpoints', () => ({ getMyCheckpoints: vi.fn() }));
vi.mock('../../context/Useauth', () => ({
  useAuth: () => ({ user: { id: 'trainee-1', name: 'Rahul Sharma' } }),
}));

const getMyCheckpointsMock = vi.mocked(getMyCheckpoints);
const SEEN_KEY = 'vinkup.checkpoints.seen:trainee-1';

function seedSeen(values: string[]) {
  window.localStorage.setItem(SEEN_KEY, JSON.stringify(values));
}

function checkpoint(overrides: Partial<TraineeCheckpointSummary> = {}): TraineeCheckpointSummary {
  return {
    id: 'checkpoint-1',
    title: 'SQL assessment',
    description: '',
    startAt: '2026-11-26T09:00:00.000Z',
    durationMinutes: 60,
    totalMarks: 20,
    passingMarks: 10,
    availability: 'AVAILABLE',
    serverNow: '2026-11-26T10:00:00.000Z',
    canStart: true,
    blockedReason: null,
    resultsPublishedAt: null,
    attempt: null,
    ...overrides,
  };
}

function Probe() {
  const { hasUnread } = useCheckpointNotifications();
  return <span>{hasUnread ? 'unread' : 'read'}</span>;
}

function renderAt(path: string) {
  return render(
    <RealtimeProvider enabled>
      <MemoryRouter initialEntries={[path]}>
        <Probe />
      </MemoryRouter>
    </RealtimeProvider>
  );
}

let fake: FakeEventSourceHandle;

beforeEach(() => {
  fake = installFakeEventSource();
  window.localStorage.clear();
  getMyCheckpointsMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useCheckpointNotifications', () => {
  it('marks an available checkpoint as unread on load', async () => {
    getMyCheckpointsMock.mockResolvedValue([checkpoint()]);

    renderAt('/');

    await waitFor(() => expect(screen.getByText('unread')).toBeInTheDocument());
  });

  it('marks an upcoming checkpoint as unread on load', async () => {
    getMyCheckpointsMock.mockResolvedValue([
      checkpoint({
        availability: 'UPCOMING',
        canStart: false,
        startAt: '2026-11-27T09:00:00.000Z',
        blockedReason: 'This checkpoint opens later.',
      }),
    ]);

    renderAt('/');

    await waitFor(() => expect(screen.getByText('unread')).toBeInTheDocument());
  });

  it('does not mark a checkpoint the trainee already saw', async () => {
    seedSeen(['checkpoint-1:published']);
    getMyCheckpointsMock.mockResolvedValue([checkpoint()]);

    renderAt('/');

    await waitFor(() => expect(getMyCheckpointsMock).toHaveBeenCalled());
    expect(screen.getByText('read')).toBeInTheDocument();
  });

  it('marks published results as unread on load', async () => {
    getMyCheckpointsMock.mockResolvedValue([
      checkpoint({
        availability: 'RESULTS_AVAILABLE',
        canStart: false,
        resultsPublishedAt: '2026-11-26T11:00:00.000Z',
        attempt: {
          id: 'attempt-1',
          attemptNumber: 1,
          status: 'SUBMITTED',
          startedAt: '2026-11-26T09:00:00.000Z',
          deadlineAt: '2026-11-26T10:00:00.000Z',
          submittedAt: '2026-11-26T09:50:00.000Z',
          submissionReason: 'MANUAL',
          totalScore: 16,
          percentage: 80,
          passed: true,
          gradedAt: '2026-11-26T11:00:00.000Z',
          resultVisible: true,
        },
      }),
    ]);

    renderAt('/');

    await waitFor(() => expect(screen.getByText('unread')).toBeInTheDocument());
  });

  it('does not mark results the trainee already saw', async () => {
    seedSeen(['checkpoint-1:published', 'checkpoint-1:results:2026-11-26T11:00:00.000Z']);
    getMyCheckpointsMock.mockResolvedValue([
      checkpoint({
        availability: 'RESULTS_AVAILABLE',
        canStart: false,
        resultsPublishedAt: '2026-11-26T11:00:00.000Z',
      }),
    ]);

    renderAt('/');

    await waitFor(() => expect(getMyCheckpointsMock).toHaveBeenCalled());
    expect(screen.getByText('read')).toBeInTheDocument();
  });

  it('shows the dot when a checkpoint is published in realtime', async () => {
    getMyCheckpointsMock.mockResolvedValue([]);
    renderAt('/');
    await waitFor(() => expect(screen.getByText('read')).toBeInTheDocument());

    act(() =>
      fake.source?.emit({
        type: 'checkpoint.published',
        checkpointId: 'checkpoint-2',
        checkpointTitle: 'New assessment',
        startAt: '2026-11-26T09:00:00.000Z',
        publishedAt: '2026-11-26T08:00:00.000Z',
      })
    );

    expect(screen.getByText('unread')).toBeInTheDocument();
  });

  it('clears the dot and remembers the visit on the Checkpoints page', async () => {
    getMyCheckpointsMock.mockResolvedValue([checkpoint()]);

    renderAt('/checkpoints');

    await waitFor(() => expect(window.localStorage.getItem(SEEN_KEY)).not.toBeNull());
    expect(screen.getByText('read')).toBeInTheDocument();
    expect(window.localStorage.getItem(SEEN_KEY)).toContain('checkpoint-1:published');

    act(() =>
      fake.source?.emit({
        type: 'checkpoint.results.published',
        checkpointId: 'checkpoint-1',
        checkpointTitle: 'SQL assessment',
        publishedAt: '2026-11-26T12:00:00.000Z',
      })
    );

    expect(screen.getByText('read')).toBeInTheDocument();
    expect(window.localStorage.getItem(SEEN_KEY)).toContain(
      'checkpoint-1:results:2026-11-26T12:00:00.000Z'
    );
  });
});
