import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import type {
  ManagerCheckpointAttemptDetail,
  ManagerCheckpointAttemptSummary,
  ManagerCheckpointDetail,
  ManagerCheckpointSummary,
} from '@itp/types';
import {
  getManagerCheckpoint,
  getManagerCheckpointAttempts,
  getManagerCheckpointAttempt,
  publishManagerCheckpointResults,
} from '../../api/checkpoints';
import { ToastProvider } from '../../components/Toast';
import { RealtimeProvider } from '../../context/RealtimeProvider';
import { installFakeEventSource } from '../../test/fakeEventSource';
import ManagerCheckpointResultsPage from './ManagerCheckpointResultsPage';

vi.mock('../../components/AdminHeader', () => ({ default: () => null }));
vi.mock('../../api/checkpoints', () => ({
  getManagerCheckpoint: vi.fn(),
  getManagerCheckpointAttempts: vi.fn(),
  getManagerCheckpointAttempt: vi.fn(),
  gradeManagerCheckpointAttempt: vi.fn(),
  publishManagerCheckpointResults: vi.fn(),
  downloadCheckpointAnswerFile: vi.fn(),
}));

function checkpoint(overrides: Partial<ManagerCheckpointSummary> = {}): ManagerCheckpointSummary {
  const now = new Date();
  return {
    id: 'checkpoint-1',
    title: 'JavaScript checkpoint',
    description: '',
    mode: 'MCQ',
    status: 'SCHEDULED',
    startAt: new Date(now.getTime() - 60_000).toISOString(),
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

const detail: ManagerCheckpointDetail = {
  ...checkpoint(),
  sourceFileName: null,
  sourceMarkdown: '',
  instructionsMarkdown: 'Read carefully.',
  questions: [],
  assignment: { traineeIds: [], groupIds: [] },
};

const submittedAttempt: ManagerCheckpointAttemptSummary = {
  id: 'attempt-1',
  traineeId: 'trainee-1',
  traineeName: 'Asha',
  traineeEmail: 'asha@example.com',
  attemptNumber: 1,
  status: 'SUBMITTED',
  startedAt: new Date().toISOString(),
  deadlineAt: new Date().toISOString(),
  submittedAt: new Date().toISOString(),
  submissionReason: 'MANUAL',
  totalScore: null,
  percentage: null,
  passed: null,
  gradedAt: null,
  resultVisible: false,
};

const attemptDetail: ManagerCheckpointAttemptDetail = {
  ...submittedAttempt,
  checkpointId: 'checkpoint-1',
  checkpointTitle: 'JavaScript checkpoint',
  checkpointTotalMarks: 10,
  feedback: null,
  gradedByName: null,
  questions: [],
  answers: [],
  events: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getManagerCheckpoint).mockResolvedValue(detail);
  vi.mocked(getManagerCheckpointAttempts).mockResolvedValue([]);
  vi.mocked(getManagerCheckpointAttempt).mockResolvedValue(attemptDetail);
  vi.mocked(publishManagerCheckpointResults).mockResolvedValue(detail);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderPage() {
  const fake = installFakeEventSource();
  render(
    <MemoryRouter initialEntries={['/manager/checkpoints/checkpoint-1/results']}>
      <ToastProvider>
        <RealtimeProvider enabled>
          <Routes>
            <Route
              path="/manager/checkpoints/:checkpointId/results"
              element={<ManagerCheckpointResultsPage />}
            />
          </Routes>
        </RealtimeProvider>
      </ToastProvider>
    </MemoryRouter>
  );
  await screen.findByRole('heading', { name: 'JavaScript checkpoint' });
  expect(getManagerCheckpointAttempts).toHaveBeenCalledTimes(1);
  return fake;
}

describe('ManagerCheckpointResultsPage: realtime', () => {
  it('refreshes the submission list when this checkpoint changes', async () => {
    const fake = await renderPage();

    vi.mocked(getManagerCheckpointAttempts).mockResolvedValue([submittedAttempt]);
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

    await waitFor(() => expect(getManagerCheckpointAttempts).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Asha')).toBeInTheDocument();
  });

  it('ignores events for another checkpoint', async () => {
    const fake = await renderPage();

    act(() => {
      fake.source?.emit({
        type: 'checkpoint.updated',
        checkpointId: 'checkpoint-2',
        reason: 'ATTEMPT_SUBMITTED',
        attemptId: 'attempt-9',
        traineeId: 'trainee-9',
        traineeName: 'Someone else',
        changedAt: '2026-11-27T10:05:00.000Z',
      });
    });

    await Promise.resolve();
    expect(getManagerCheckpointAttempts).toHaveBeenCalledTimes(1);
  });

  it('refreshes after the stream reconnects', async () => {
    const fake = await renderPage();

    act(() => {
      fake.source?.emitOpen();
      fake.source?.emitOpen();
    });

    await waitFor(() => expect(getManagerCheckpointAttempts).toHaveBeenCalledTimes(2));
  });
});
