import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CheckpointActiveError,
  CheckpointAttemptFinalizedError,
  CheckpointExpiredError,
  CheckpointNotAssignedError,
  NotFoundError,
} from '../../errors/AppError';

const repo = vi.hoisted(() => ({
  listTraineeCheckpoints: vi.fn(),
  findTraineeCheckpoint: vi.fn(),
  isAssigned: vi.fn(),
  findAttemptWithCheckpoint: vi.fn(),
  findAttempt: vi.fn(),
  findActiveAttemptWithCheckpoint: vi.fn(),
  findLatestTraineeAttempt: vi.fn(),
  startAttempt: vi.fn(),
  finalizeAttempt: vi.fn(),
  findAttemptDetail: vi.fn(),
  findVisibleResult: vi.fn(),
  touchAttempt: vi.fn(),
  saveAnswer: vi.fn(),
}));

vi.mock('./checkpoint.repository', () => ({
  CheckpointRepository: class {
    listTraineeCheckpoints = repo.listTraineeCheckpoints;
    findTraineeCheckpoint = repo.findTraineeCheckpoint;
    isAssigned = repo.isAssigned;
    findAttemptWithCheckpoint = repo.findAttemptWithCheckpoint;
    findAttempt = repo.findAttempt;
    findActiveAttemptWithCheckpoint = repo.findActiveAttemptWithCheckpoint;
    findLatestTraineeAttempt = repo.findLatestTraineeAttempt;
    startAttempt = repo.startAttempt;
    finalizeAttempt = repo.finalizeAttempt;
    findAttemptDetail = repo.findAttemptDetail;
    findVisibleResult = repo.findVisibleResult;
    touchAttempt = repo.touchAttempt;
    saveAnswer = repo.saveAnswer;
  },
}));

import { CheckpointTraineeService } from './checkpoint.trainee.service';

const traineeId = 'trainee-1';
const checkpointId = 'checkpoint-1';
const attemptId = 'attempt-1';

const question = {
  id: 'question-1',
  order_index: 1,
  title: 'Pick one',
  prompt_markdown: 'Which one?',
  type: 'MULTIPLE_CHOICE',
  marks: 5,
  options: ['A', 'B'],
  correct_option: null,
  code_language: null,
};

function checkpointRow(overrides: Record<string, unknown> = {}) {
  return {
    id: checkpointId,
    title: 'Assessment',
    description: 'A checkpoint',
    status: 'SCHEDULED',
    start_at: new Date(Date.now() - 60_000),
    duration_minutes: 60,
    total_marks: 10,
    passing_marks: 5,
    max_attempts: 2,
    allow_early_submission: true,
    allow_late_entry: true,
    result_visibility: 'AFTER_APPROVAL',
    results_published_at: null,
    instructions_markdown: 'Read carefully.',
    questions: [question],
    attempts: [],
    ...overrides,
  };
}

function attemptRow(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: attemptId,
    checkpoint_id: checkpointId,
    trainee_id: traineeId,
    attempt_number: 1,
    status: 'IN_PROGRESS',
    started_at: new Date(now - 60_000),
    deadline_at: new Date(now + 60 * 60_000),
    submitted_at: null,
    submission_reason: null,
    total_score: null,
    graded_at: null,
    answers: [
      {
        question_id: question.id,
        answer_text: '',
        selected_option: null,
        file_name: null,
        file_mime_type: null,
        file_size: null,
        client_revision: 0,
        saved_at: new Date(now - 60_000),
      },
    ],
    checkpoint: {
      id: checkpointId,
      title: 'Assessment',
      instructions_markdown: 'Read carefully.',
      total_marks: 10,
      passing_marks: 5,
      allow_early_submission: true,
      result_visibility: 'AFTER_APPROVAL',
      results_published_at: null,
      questions: [question],
    },
    ...overrides,
  };
}

function summaryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: attemptId,
    status: 'SUBMITTED',
    submitted_at: new Date(),
    submission_reason: 'MANUAL',
    total_score: 7,
    graded_at: null,
    ...overrides,
  };
}

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: attemptId,
    trainee_id: traineeId,
    status: 'SUBMITTED',
    submitted_at: new Date(),
    submission_reason: 'MANUAL',
    total_score: 7,
    graded_at: new Date(),
    feedback: 'Good work',
    answers: [
      {
        question_id: question.id,
        answer_text: null,
        selected_option: 'A',
        file_name: null,
        awarded_marks: 5,
        feedback: null,
      },
    ],
    checkpoint: {
      id: checkpointId,
      title: 'Assessment',
      total_marks: 10,
      passing_marks: 5,
      result_visibility: 'AFTER_APPROVAL',
      results_published_at: null,
      questions: [question],
    },
    ...overrides,
  };
}

describe('CheckpointTraineeService', () => {
  let service: CheckpointTraineeService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CheckpointTraineeService();
    repo.isAssigned.mockResolvedValue(true);
    repo.findActiveAttemptWithCheckpoint.mockResolvedValue(null);
    repo.touchAttempt.mockResolvedValue({ count: 1 });
    repo.finalizeAttempt.mockResolvedValue(summaryRow());
  });

  describe('start', () => {
    it('resumes an in-progress attempt instead of creating another', async () => {
      repo.findTraineeCheckpoint.mockResolvedValue(
        checkpointRow({
          attempts: [{ status: 'IN_PROGRESS', deadline_at: new Date(Date.now() + 60_000) }],
        })
      );
      repo.findAttemptWithCheckpoint.mockResolvedValue(attemptRow());

      const attempt = await service.start(traineeId, checkpointId);

      expect(attempt.id).toBe(attemptId);
      expect(attempt.status).toBe('IN_PROGRESS');
      expect(repo.startAttempt).not.toHaveBeenCalled();
    });

    it('rejects a checkpoint the trainee is not assigned to', async () => {
      repo.findTraineeCheckpoint.mockResolvedValue(null);

      await expect(service.start(traineeId, checkpointId)).rejects.toBeInstanceOf(
        CheckpointNotAssignedError
      );
    });

    it('rejects starting before the scheduled time', async () => {
      repo.findTraineeCheckpoint.mockResolvedValue(
        checkpointRow({ start_at: new Date(Date.now() + 10 * 60_000) })
      );

      await expect(service.start(traineeId, checkpointId)).rejects.toMatchObject({
        code: 'CHECKPOINT_NOT_AVAILABLE',
      });
      expect(repo.startAttempt).not.toHaveBeenCalled();
    });

    it('rejects late entry when the checkpoint disallows it', async () => {
      repo.findTraineeCheckpoint.mockResolvedValue(
        checkpointRow({
          start_at: new Date(Date.now() - 20 * 60_000),
          duration_minutes: 60,
          allow_late_entry: false,
        })
      );

      await expect(service.start(traineeId, checkpointId)).rejects.toMatchObject({
        code: 'CHECKPOINT_NOT_AVAILABLE',
      });
    });

    it('rejects a checkpoint whose entry window has closed', async () => {
      repo.findTraineeCheckpoint.mockResolvedValue(
        checkpointRow({
          start_at: new Date(Date.now() - 2 * 60 * 60_000),
          duration_minutes: 60,
        })
      );

      await expect(service.start(traineeId, checkpointId)).rejects.toMatchObject({
        code: 'CHECKPOINT_NOT_AVAILABLE',
      });
    });

    it('rejects when the trainee has used all attempts', async () => {
      repo.findTraineeCheckpoint.mockResolvedValue(
        checkpointRow({
          max_attempts: 1,
          attempts: [
            {
              status: 'SUBMITTED',
              deadline_at: new Date(Date.now() - 60_000),
            },
          ],
        })
      );

      await expect(service.start(traineeId, checkpointId)).rejects.toMatchObject({
        code: 'CHECKPOINT_ATTEMPT_LIMIT_REACHED',
      });
    });

    it('sends the trainee back to a different active attempt', async () => {
      repo.findTraineeCheckpoint.mockResolvedValue(checkpointRow());
      repo.findActiveAttemptWithCheckpoint.mockResolvedValue({
        id: 'other-attempt',
        checkpoint_id: 'other-checkpoint',
        deadline_at: new Date(Date.now() + 60_000),
      });

      await expect(service.start(traineeId, checkpointId)).rejects.toBeInstanceOf(
        CheckpointActiveError
      );
    });

    it('creates an attempt with a server-owned deadline', async () => {
      repo.findTraineeCheckpoint.mockResolvedValue(checkpointRow({ duration_minutes: 30 }));
      repo.startAttempt.mockResolvedValue(attemptRow());

      const before = Date.now();
      const attempt = await service.start(traineeId, checkpointId);
      const after = Date.now();

      expect(attempt.id).toBe(attemptId);
      expect(repo.startAttempt).toHaveBeenCalledTimes(1);
      const startCall = repo.startAttempt.mock.calls[0] as unknown as [
        string,
        string,
        Date,
        Date,
        number,
        Array<{ id: string }>,
      ];
      const startedAt = startCall[2];
      const deadlineAt = startCall[3];
      const attemptNumber = startCall[4];
      const questions = startCall[5];
      expect(startedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(startedAt.getTime()).toBeLessThanOrEqual(after);
      expect(deadlineAt.getTime() - startedAt.getTime()).toBe(30 * 60_000);
      expect(attemptNumber).toBe(1);
      expect(questions).toEqual([question]);
    });
  });

  describe('saveAnswer', () => {
    it('rejects answers on a submitted attempt', async () => {
      repo.findAttemptWithCheckpoint.mockResolvedValue(attemptRow({ status: 'SUBMITTED' }));

      await expect(
        service.saveAnswer(traineeId, attemptId, question.id, {
          clientRevision: 1,
          answerText: 'A',
        })
      ).rejects.toBeInstanceOf(CheckpointAttemptFinalizedError);
      expect(repo.saveAnswer).not.toHaveBeenCalled();
    });

    it('finalises and rejects an answer after the deadline', async () => {
      repo.findAttemptWithCheckpoint.mockResolvedValue(
        attemptRow({ deadline_at: new Date(Date.now() - 1_000) })
      );

      await expect(
        service.saveAnswer(traineeId, attemptId, question.id, {
          clientRevision: 1,
          answerText: 'A',
        })
      ).rejects.toBeInstanceOf(CheckpointExpiredError);
      expect(repo.finalizeAttempt).toHaveBeenCalledWith(
        attemptId,
        'TIME_EXPIRED',
        expect.any(Date)
      );
      expect(repo.saveAnswer).not.toHaveBeenCalled();
    });

    it('rejects a multiple-choice option that is not offered', async () => {
      repo.findAttemptWithCheckpoint.mockResolvedValue(attemptRow());

      await expect(
        service.saveAnswer(traineeId, attemptId, question.id, {
          clientRevision: 1,
          selectedOption: 'Z',
        })
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('rejects an answer for a question outside the checkpoint', async () => {
      repo.findAttemptWithCheckpoint.mockResolvedValue(attemptRow());

      await expect(
        service.saveAnswer(traineeId, attemptId, 'unknown-question', {
          clientRevision: 1,
          answerText: 'hello',
        })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('saves text and reports the stored revision', async () => {
      repo.findAttemptWithCheckpoint.mockResolvedValue(attemptRow());
      const savedAt = new Date();
      repo.saveAnswer.mockResolvedValue({ clientRevision: 4, savedAt, stale: false });

      const result = await service.saveAnswer(traineeId, attemptId, question.id, {
        clientRevision: 4,
        answerText: 'My answer',
      });

      const [saveInput] = repo.saveAnswer.mock.calls[0] as unknown as [
        {
          attemptId: string;
          questionId: string;
          clientRevision: number;
          fields: Record<string, unknown>;
          now: Date;
        },
      ];
      expect(saveInput).toMatchObject({
        attemptId,
        questionId: question.id,
        clientRevision: 4,
        fields: { answer_text: 'My answer' },
      });
      expect(saveInput.now).toBeInstanceOf(Date);
      expect(result).toEqual({
        questionId: question.id,
        clientRevision: 4,
        savedAt: savedAt.toISOString(),
        stale: false,
      });
      expect(repo.touchAttempt).toHaveBeenCalledWith(attemptId, expect.any(Date));
    });

    it('passes file payloads through and can clear them', async () => {
      repo.findAttemptWithCheckpoint.mockResolvedValue(attemptRow());
      repo.saveAnswer.mockResolvedValue({ clientRevision: 2, savedAt: new Date(), stale: false });

      await service.saveAnswer(traineeId, attemptId, question.id, {
        clientRevision: 2,
        file: {
          name: 'answer.pdf',
          mimeType: 'application/pdf',
          size: 12,
          dataBase64: 'ZmFrZQ==',
        },
      });

      const firstSave = repo.saveAnswer.mock.calls[0][0] as unknown as {
        fields: Record<string, unknown>;
      };
      expect(firstSave.fields).toEqual({
        file_name: 'answer.pdf',
        file_mime_type: 'application/pdf',
        file_size: 12,
        file_data: 'ZmFrZQ==',
      });

      await service.saveAnswer(traineeId, attemptId, question.id, {
        clientRevision: 3,
        clearFile: true,
      });

      const clearSave = repo.saveAnswer.mock.calls[1][0] as unknown as {
        fields: Record<string, unknown>;
      };
      expect(clearSave.fields).toEqual({
        file_name: null,
        file_mime_type: null,
        file_size: null,
        file_data: null,
      });
    });

    it('returns the stored revision when the write is rejected as stale', async () => {
      repo.findAttemptWithCheckpoint.mockResolvedValue(attemptRow());
      const savedAt = new Date();
      repo.saveAnswer.mockResolvedValue({ clientRevision: 9, savedAt, stale: true });

      const result = await service.saveAnswer(traineeId, attemptId, question.id, {
        clientRevision: 3,
        answerText: 'older',
      });

      expect(result).toMatchObject({
        clientRevision: 9,
        stale: true,
        savedAt: savedAt.toISOString(),
      });
      expect(repo.touchAttempt).toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    it('is idempotent when the attempt is already submitted', async () => {
      repo.findAttemptWithCheckpoint.mockResolvedValue(attemptRow({ status: 'SUBMITTED' }));
      repo.findAttemptDetail.mockResolvedValue(summaryRow({ total_score: 8 }));

      const result = await service.submit(traineeId, attemptId);

      expect(result.status).toBe('SUBMITTED');
      expect(result.submissionReason).toBe('MANUAL');
      expect(repo.finalizeAttempt).not.toHaveBeenCalled();
    });

    it('auto-submits with TIME_EXPIRED when the deadline has passed', async () => {
      repo.findAttemptWithCheckpoint.mockResolvedValue(
        attemptRow({ deadline_at: new Date(Date.now() - 1_000) })
      );
      repo.finalizeAttempt.mockResolvedValue(summaryRow({ submission_reason: 'TIME_EXPIRED' }));

      const result = await service.submit(traineeId, attemptId);

      expect(repo.finalizeAttempt).toHaveBeenCalledWith(
        attemptId,
        'TIME_EXPIRED',
        expect.any(Date)
      );
      expect(result.submissionReason).toBe('TIME_EXPIRED');
    });

    it('rejects manual submission when early submission is disabled', async () => {
      repo.findAttemptWithCheckpoint.mockResolvedValue(
        attemptRow({
          checkpoint: { ...attemptRow().checkpoint, allow_early_submission: false },
        })
      );

      await expect(service.submit(traineeId, attemptId)).rejects.toMatchObject({
        code: 'CHECKPOINT_EARLY_SUBMISSION_DISABLED',
      });
      expect(repo.finalizeAttempt).not.toHaveBeenCalled();
    });

    it('finalises manually during the attempt window', async () => {
      repo.findAttemptWithCheckpoint.mockResolvedValue(attemptRow());

      const result = await service.submit(traineeId, attemptId);

      expect(repo.finalizeAttempt).toHaveBeenCalledWith(attemptId, 'MANUAL', expect.any(Date));
      expect(result.status).toBe('SUBMITTED');
    });

    it('does not allow submitting another trainee attempt', async () => {
      repo.findAttemptWithCheckpoint.mockResolvedValue(attemptRow({ trainee_id: 'someone-else' }));

      await expect(service.submit(traineeId, attemptId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getAttempt', () => {
    it('finalises an expired attempt and returns the submitted state', async () => {
      repo.findAttemptWithCheckpoint
        .mockResolvedValueOnce(attemptRow({ deadline_at: new Date(Date.now() - 1_000) }))
        .mockResolvedValueOnce(attemptRow({ status: 'SUBMITTED' }));
      repo.findVisibleResult.mockResolvedValue(null);

      const attempt = await service.getAttempt(traineeId, attemptId);

      expect(repo.finalizeAttempt).toHaveBeenCalledWith(
        attemptId,
        'TIME_EXPIRED',
        expect.any(Date)
      );
      expect(attempt.status).toBe('SUBMITTED');
      expect(repo.touchAttempt).not.toHaveBeenCalled();
    });

    it('touches last-seen for a live attempt', async () => {
      repo.findAttemptWithCheckpoint.mockResolvedValue(attemptRow());

      await service.getAttempt(traineeId, attemptId);

      expect(repo.touchAttempt).toHaveBeenCalledWith(attemptId, expect.any(Date));
    });

    it('attaches a visible result to a submitted attempt', async () => {
      repo.findAttemptWithCheckpoint.mockResolvedValue(attemptRow({ status: 'SUBMITTED' }));
      repo.findVisibleResult.mockResolvedValue(
        detailRow({
          checkpoint: { ...detailRow().checkpoint, results_published_at: new Date() },
        })
      );

      const attempt = await service.getAttempt(traineeId, attemptId);

      expect(attempt.result).not.toBeNull();
      expect(attempt.result?.score).toBe(7);
    });
  });

  describe('getResult', () => {
    it('throws when the result is not visible yet', async () => {
      repo.findVisibleResult.mockResolvedValue(detailRow({ graded_at: null }));

      await expect(service.getResult(traineeId, attemptId)).rejects.toMatchObject({
        code: 'CHECKPOINT_RESULTS_NOT_READY',
      });
    });

    it('returns the result once graded and published', async () => {
      repo.findVisibleResult.mockResolvedValue(
        detailRow({
          checkpoint: {
            ...detailRow().checkpoint,
            results_published_at: new Date(),
          },
        })
      );

      const result = await service.getResult(traineeId, attemptId);

      expect(result.visible).toBe(true);
      expect(result.score).toBe(7);
      expect(result.percentage).toBe(70);
      expect(result.passed).toBe(true);
    });

    it('hides results for an attempt the trainee does not own', async () => {
      repo.findVisibleResult.mockResolvedValue(null);

      await expect(service.getResult(traineeId, attemptId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getTime', () => {
    it('returns a server-synced remaining time', async () => {
      const deadline = new Date(Date.now() + 90_000);
      repo.findAttempt.mockResolvedValue({
        trainee_id: traineeId,
        status: 'IN_PROGRESS',
        deadline_at: deadline,
        submitted_at: null,
        submission_reason: null,
      });

      const time = await service.getTime(traineeId, attemptId);

      expect(time.deadlineAt).toBe(deadline.toISOString());
      expect(time.remainingSeconds).toBeGreaterThan(80);
      expect(time.remainingSeconds).toBeLessThanOrEqual(90);
      expect(time.status).toBe('IN_PROGRESS');
    });
  });

  describe('getActive', () => {
    it('returns null when the only active attempt has expired', async () => {
      repo.findActiveAttemptWithCheckpoint.mockResolvedValue({
        id: attemptId,
        deadline_at: new Date(Date.now() - 1_000),
      });

      const active = await service.getActive(traineeId);

      expect(active).toBeNull();
      expect(repo.finalizeAttempt).toHaveBeenCalledWith(
        attemptId,
        'TIME_EXPIRED',
        expect.any(Date)
      );
    });
  });
});
