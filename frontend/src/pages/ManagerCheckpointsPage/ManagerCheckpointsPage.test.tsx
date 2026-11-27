import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import type {
  CheckpointGroup,
  ManagerCheckpointDetail,
  ManagerCheckpointSummary,
  ManagerTrainee,
} from '@itp/types';
import {
  cancelManagerCheckpoint,
  getCheckpointGroups,
  getManagerCheckpoints,
  publishManagerCheckpoint,
} from '../../api/checkpoints';
import { getManagerTrainees } from '../../api/manager';
import { ToastProvider } from '../../components/Toast';
import { RealtimeProvider } from '../../context/RealtimeProvider';
import { installFakeEventSource } from '../../test/fakeEventSource';
import ManagerCheckpointsPage from './ManagerCheckpointsPage';

vi.mock('../../components/AdminHeader', () => ({ default: () => null }));
vi.mock('../../api/checkpoints', () => ({
  getManagerCheckpoints: vi.fn(),
  getCheckpointGroups: vi.fn(),
  publishManagerCheckpoint: vi.fn(),
  cancelManagerCheckpoint: vi.fn(),
}));
vi.mock('../../api/manager', () => ({ getManagerTrainees: vi.fn() }));

function checkpoint(overrides: Partial<ManagerCheckpointSummary> = {}): ManagerCheckpointSummary {
  const now = new Date();
  return {
    id: 'checkpoint-1',
    title: 'JavaScript checkpoint',
    description: '',
    mode: 'MCQ',
    status: 'SCHEDULED',
    startAt: new Date(now.getTime() + 60_000).toISOString(),
    durationMinutes: 60,
    totalMarks: 10,
    passingMarks: 5,
    maxAttempts: 1,
    allowEarlySubmission: true,
    allowLateEntry: true,
    resultVisibility: 'AFTER_APPROVAL',
    resultsPublishedAt: null,
    assignedCount: 3,
    attemptCount: 0,
    submittedCount: 0,
    gradedCount: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...overrides,
  };
}

function checkpointDetail(
  overrides: Partial<ManagerCheckpointDetail> = {}
): ManagerCheckpointDetail {
  return {
    ...checkpoint(overrides),
    sourceFileName: null,
    sourceMarkdown: '',
    instructionsMarkdown: '',
    questions: [],
    assignment: { traineeIds: [], groupIds: [] },
  };
}

const groups: CheckpointGroup[] = [];
const trainees: ManagerTrainee[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCheckpointGroups).mockResolvedValue(groups);
  vi.mocked(getManagerTrainees).mockResolvedValue(trainees);
  vi.mocked(getManagerCheckpoints).mockResolvedValue([checkpoint()]);
  vi.mocked(publishManagerCheckpoint).mockResolvedValue(checkpointDetail());
  vi.mocked(cancelManagerCheckpoint).mockResolvedValue(checkpointDetail({ status: 'CANCELLED' }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderPage() {
  const fake = installFakeEventSource();
  render(
    <MemoryRouter initialEntries={['/manager/checkpoints']}>
      <ToastProvider>
        <RealtimeProvider enabled>
          <ManagerCheckpointsPage />
        </RealtimeProvider>
      </ToastProvider>
    </MemoryRouter>
  );
  await screen.findByRole('table');
  expect(getManagerCheckpoints).toHaveBeenCalledTimes(1);
  return fake;
}

describe('ManagerCheckpointsPage: realtime', () => {
  it('shows the submitted count and refreshes when a trainee starts an attempt', async () => {
    const fake = await renderPage();
    expect(screen.getByText('0/0 submitted')).toBeInTheDocument();

    vi.mocked(getManagerCheckpoints).mockResolvedValue([
      checkpoint({ attemptCount: 1, submittedCount: 0 }),
    ]);
    act(() => {
      fake.source?.emit({
        type: 'checkpoint.updated',
        checkpointId: 'checkpoint-1',
        reason: 'ATTEMPT_STARTED',
        attemptId: 'attempt-1',
        traineeId: 'trainee-1',
        traineeName: 'Asha',
        changedAt: '2026-11-27T10:00:00.000Z',
      });
    });

    await waitFor(() => expect(getManagerCheckpoints).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('0/1 submitted')).toBeInTheDocument();
  });

  it('updates the submitted count when an attempt is submitted', async () => {
    vi.mocked(getManagerCheckpoints).mockResolvedValue([
      checkpoint({ attemptCount: 1, submittedCount: 0 }),
    ]);
    const fake = await renderPage();
    expect(screen.getByText('0/1 submitted')).toBeInTheDocument();

    vi.mocked(getManagerCheckpoints).mockResolvedValue([
      checkpoint({ attemptCount: 1, submittedCount: 1 }),
    ]);
    act(() => {
      fake.source?.emit({
        type: 'checkpoint.updated',
        checkpointId: 'checkpoint-1',
        reason: 'ATTEMPT_SUBMITTED',
        attemptId: 'attempt-1',
        traineeId: 'trainee-1',
        traineeName: 'Asha',
        changedAt: '2026-11-27T10:05:00.000Z',
      });
    });

    expect(await screen.findByText('1/1 submitted')).toBeInTheDocument();
  });

  it('refreshes on a reconnect so events missed while offline are recovered', async () => {
    const fake = await renderPage();
    vi.mocked(getManagerCheckpoints).mockResolvedValue([
      checkpoint({ attemptCount: 2, submittedCount: 1 }),
    ]);

    act(() => {
      fake.source?.emitOpen();
      fake.source?.emitOpen();
    });

    await waitFor(() => expect(getManagerCheckpoints).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('1/2 submitted')).toBeInTheDocument();
  });
});
