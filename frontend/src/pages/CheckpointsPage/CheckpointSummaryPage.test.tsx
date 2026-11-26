import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { TraineeCheckpointAttempt, TraineeCheckpointDetail } from '@itp/types';
import CheckpointSummaryPage from './CheckpointSummaryPage';
import { getCheckpointAttempt, getCheckpointResult, getMyCheckpoint } from '../../api/checkpoints';
import { ApiError } from '../../api/errors';

vi.mock('../../api/checkpoints', () => ({
  getCheckpointAttempt: vi.fn(),
  getCheckpointResult: vi.fn(),
  getMyCheckpoint: vi.fn(),
}));

// The Header is covered by its own tests; here we only check the lock wiring.
vi.mock('../../components/Header', () => ({
  default: ({ locked }: { locked?: boolean }) => (
    <header data-testid="app-header" data-locked={locked ? 'true' : 'false'} />
  ),
}));

const submittedAttempt: TraineeCheckpointAttempt = {
  id: 'a1',
  checkpointId: 'c1',
  checkpointTitle: 'React checkpoint',
  instructionsMarkdown: '',
  status: 'SUBMITTED',
  startedAt: '2026-11-26T04:00:00.000Z',
  deadlineAt: '2026-11-26T05:00:00.000Z',
  serverNow: '2026-11-26T04:30:00.000Z',
  remainingSeconds: 1800,
  submittedAt: '2026-11-26T04:20:00.000Z',
  submissionReason: 'MANUAL',
  allowEarlySubmission: true,
  totalMarks: 100,
  passingMarks: 40,
  attemptNumber: 1,
  questions: [],
  answers: [],
  result: null,
};

function checkpointDetail(overrides: Partial<TraineeCheckpointDetail>): TraineeCheckpointDetail {
  return {
    id: 'c1',
    title: 'React checkpoint',
    description: '',
    startAt: '2026-11-26T04:00:00.000Z',
    durationMinutes: 60,
    totalMarks: 100,
    passingMarks: 40,
    availability: 'SUBMITTED',
    serverNow: '2026-11-26T04:30:00.000Z',
    canStart: false,
    blockedReason: null,
    attempt: null,
    instructionsMarkdown: '',
    allowEarlySubmission: true,
    allowLateEntry: true,
    maxAttempts: 3,
    attemptsUsed: 1,
    resultVisibility: 'AFTER_APPROVAL',
    resultsPublishedAt: null,
    ...overrides,
  };
}

function renderSummary() {
  return render(
    <MemoryRouter initialEntries={['/checkpoints/attempts/a1/summary']}>
      <Routes>
        <Route
          path="/checkpoints/attempts/:attemptId/summary"
          element={<CheckpointSummaryPage />}
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.mocked(getCheckpointAttempt).mockResolvedValue(submittedAttempt);
  vi.mocked(getCheckpointResult).mockRejectedValue(
    new ApiError(409, 'CHECKPOINT_RESULTS_NOT_READY', 'Results are not ready yet.')
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CheckpointSummaryPage', () => {
  it('offers the next attempt and keeps the header locked while the window is open', async () => {
    vi.mocked(getMyCheckpoint).mockResolvedValue(checkpointDetail({ canStart: true }));

    renderSummary();

    expect(await screen.findByRole('link', { name: /Start attempt 2/i })).toHaveAttribute(
      'href',
      '/checkpoints/c1'
    );
    expect(screen.getByTestId('app-header')).toHaveAttribute('data-locked', 'true');
    expect(screen.getByText(/You have another attempt available/i)).toBeInTheDocument();
  });

  it('does not offer another attempt once the attempts are used', async () => {
    vi.mocked(getMyCheckpoint).mockResolvedValue(
      checkpointDetail({ canStart: false, attemptsUsed: 3 })
    );

    renderSummary();

    expect(await screen.findByText(/You can leave this page/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Start attempt/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('app-header')).toHaveAttribute('data-locked', 'false');
  });
});
