import type {
  CheckpointAttemptTime,
  CheckpointResult,
  SaveCheckpointAnswerResponse,
  SubmitCheckpointAttemptResponse,
  TraineeCheckpointAttempt,
  TraineeCheckpointDetail,
  TraineeCheckpointSummary,
} from '@itp/types';
import {
  AppError,
  CheckpointActiveError,
  CheckpointAttemptFinalizedError,
  CheckpointExpiredError,
  CheckpointNotAssignedError,
  NotFoundError,
  ValidationError,
} from '../../errors/AppError';
import {
  isResultVisible,
  LATE_ENTRY_GRACE_MS,
  percentageOf,
  toCheckpointResult,
  toTraineeAttempt,
  toTraineeDetail,
  toTraineeSummary,
} from './checkpoint.mapper';
import { CheckpointRepository, type AttemptSummaryRow } from './checkpoint.repository';
import { publishCheckpointActivity } from './checkpoint.notify';
import type { SaveAnswerBody } from './checkpoint.schema';

const repository = new CheckpointRepository();

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

function remainingSeconds(deadlineAt: Date, now: Date): number {
  return Math.max(0, Math.floor((deadlineAt.getTime() - now.getTime()) / 1000));
}

function toSubmitResponse(
  row: AttemptSummaryRow | null,
  checkpoint: {
    total_marks: number;
    passing_marks: number;
    result_visibility: string;
    results_published_at: Date | null;
  }
): SubmitCheckpointAttemptResponse {
  if (!row) throw new NotFoundError('Attempt not found.');
  return {
    id: row.id,
    status: row.status,
    submittedAt: row.submitted_at?.toISOString() ?? null,
    submissionReason: row.submission_reason,
    totalScore: row.total_score,
    percentage: percentageOf(row.total_score, checkpoint.total_marks),
    passed: row.total_score === null ? null : row.total_score >= checkpoint.passing_marks,
    gradedAt: row.graded_at?.toISOString() ?? null,
    resultVisible: isResultVisible({
      resultVisibility: checkpoint.result_visibility as 'IMMEDIATE' | 'AFTER_APPROVAL',
      resultsPublishedAt: checkpoint.results_published_at,
      gradedAt: row.graded_at,
    }),
  };
}

async function finalizeExpired(
  attempt: { id: string; deadline_at: Date },
  now: Date
): Promise<AttemptSummaryRow | null> {
  if (attempt.deadline_at.getTime() <= now.getTime()) {
    return repository.finalizeAttempt(attempt.id, 'TIME_EXPIRED', now);
  }
  return null;
}

/** Tells managers that an attempt became submitted, whichever path finalised it. */
async function publishSubmitted(row: AttemptSummaryRow | null, traineeId: string): Promise<void> {
  if (row?.status !== 'SUBMITTED') return;
  await publishCheckpointActivity({
    checkpointId: row.checkpoint_id,
    reason: 'ATTEMPT_SUBMITTED',
    attemptId: row.id,
    traineeId,
    traineeName: row.trainee.name,
  });
}

export class CheckpointTraineeService {
  listMine = async (traineeId: string): Promise<TraineeCheckpointSummary[]> => {
    const now = new Date();
    const rows = await repository.listTraineeCheckpoints(traineeId);
    return rows.map((row) => toTraineeSummary(row, now));
  };

  getCheckpoint = async (
    traineeId: string,
    checkpointId: string
  ): Promise<TraineeCheckpointDetail> => {
    const now = new Date();
    const row = await repository.findTraineeCheckpoint(traineeId, checkpointId);
    if (!row) throw new CheckpointNotAssignedError();
    if (!(await repository.isAssigned(traineeId, checkpointId))) {
      throw new CheckpointNotAssignedError();
    }
    return toTraineeDetail(row, now);
  };

  start = async (traineeId: string, checkpointId: string): Promise<TraineeCheckpointAttempt> => {
    const now = new Date();
    let checkpoint = await repository.findTraineeCheckpoint(traineeId, checkpointId);
    if (!checkpoint) throw new CheckpointNotAssignedError();

    const latest = checkpoint.attempts[0];

    // A refresh or a repeat click resumes the same server-owned attempt.
    if (latest?.status === 'IN_PROGRESS') {
      if (latest.deadline_at.getTime() > now.getTime()) {
        const active = await repository.findAttemptWithCheckpoint(latest.id);
        if (active) return toTraineeAttempt(active);
      }
      const expired = await repository.finalizeAttempt(latest.id, 'TIME_EXPIRED', now);
      await publishSubmitted(expired, traineeId);
      checkpoint = await repository.findTraineeCheckpoint(traineeId, checkpointId);
      if (!checkpoint) throw new CheckpointNotAssignedError();
    }

    // Only one live attempt may exist per trainee. If another checkpoint is
    // running, send the client back there instead of creating a second attempt.
    const activeOther = await repository.findActiveAttemptWithCheckpoint(traineeId);
    if (activeOther) {
      if (activeOther.deadline_at.getTime() <= now.getTime()) {
        const expired = await repository.finalizeAttempt(activeOther.id, 'TIME_EXPIRED', now);
        await publishSubmitted(expired, traineeId);
      } else {
        throw new CheckpointActiveError({
          attemptId: activeOther.id,
          checkpointId: activeOther.checkpoint_id,
        });
      }
    }

    if (!checkpoint.start_at) {
      throw new AppError(
        403,
        'CHECKPOINT_NOT_AVAILABLE',
        'This checkpoint has not been scheduled.'
      );
    }
    if (now.getTime() < checkpoint.start_at.getTime()) {
      throw new AppError(
        403,
        'CHECKPOINT_NOT_AVAILABLE',
        `This checkpoint opens at ${checkpoint.start_at.toISOString()}.`
      );
    }

    const windowEnd = checkpoint.start_at.getTime() + checkpoint.duration_minutes * 60_000;
    if (now.getTime() >= windowEnd) {
      throw new AppError(
        403,
        'CHECKPOINT_NOT_AVAILABLE',
        'The entry window for this checkpoint has closed.'
      );
    }
    if (
      !checkpoint.allow_late_entry &&
      checkpoint.attempts.length === 0 &&
      now.getTime() > checkpoint.start_at.getTime() + LATE_ENTRY_GRACE_MS
    ) {
      throw new AppError(
        403,
        'CHECKPOINT_NOT_AVAILABLE',
        'Late entry is not permitted for this checkpoint.'
      );
    }

    const attemptsUsed = checkpoint.attempts.length;
    if (attemptsUsed >= checkpoint.max_attempts) {
      throw new AppError(
        409,
        'CHECKPOINT_ATTEMPT_LIMIT_REACHED',
        `You have used all ${checkpoint.max_attempts} attempt${checkpoint.max_attempts === 1 ? '' : 's'}.`
      );
    }

    const deadlineAt = new Date(now.getTime() + checkpoint.duration_minutes * 60_000);

    try {
      const attempt = await repository.startAttempt(
        checkpointId,
        traineeId,
        now,
        deadlineAt,
        attemptsUsed + 1,
        checkpoint.questions
      );
      await publishCheckpointActivity({
        checkpointId,
        reason: 'ATTEMPT_STARTED',
        attemptId: attempt.id,
        traineeId,
        traineeName: attempt.trainee.name,
      });
      return toTraineeAttempt(attempt);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      // A simultaneous start won the race. Return that attempt when it belongs
      // to this checkpoint; otherwise the trainee has a different one running.
      const runningLatest = await repository.findLatestTraineeAttempt(checkpointId, traineeId);
      if (runningLatest) {
        const running = await repository.findAttemptWithCheckpoint(runningLatest.id);
        if (running) return toTraineeAttempt(running);
      }
      const active = await repository.findActiveAttemptWithCheckpoint(traineeId);
      throw new CheckpointActiveError(
        active ? { attemptId: active.id, checkpointId: active.checkpoint_id } : undefined
      );
    }
  };

  getAttempt = async (traineeId: string, attemptId: string): Promise<TraineeCheckpointAttempt> => {
    const now = new Date();
    let attempt = await repository.findAttemptWithCheckpoint(attemptId);
    if (!attempt || attempt.trainee_id !== traineeId) throw new NotFoundError('Attempt not found.');

    if (attempt.status === 'IN_PROGRESS' && attempt.deadline_at.getTime() <= now.getTime()) {
      await publishSubmitted(await finalizeExpired(attempt, now), traineeId);
      attempt = await repository.findAttemptWithCheckpoint(attemptId);
      if (!attempt) throw new NotFoundError('Attempt not found.');
    }

    const dto = toTraineeAttempt(attempt);
    if (attempt.status === 'SUBMITTED') {
      const detail = await repository.findVisibleResult(attemptId, traineeId);
      if (detail && dto.result === null) {
        const result = toCheckpointResult(detail);
        if (result.visible) dto.result = result;
      }
    } else {
      await repository.touchAttempt(attemptId, now);
    }
    return dto;
  };

  getActive = async (traineeId: string): Promise<TraineeCheckpointAttempt | null> => {
    const now = new Date();
    const active = await repository.findActiveAttemptWithCheckpoint(traineeId);
    if (!active) return null;
    if (active.deadline_at.getTime() <= now.getTime()) {
      await publishSubmitted(
        await repository.finalizeAttempt(active.id, 'TIME_EXPIRED', now),
        traineeId
      );
      return null;
    }
    const attempt = await repository.findAttemptWithCheckpoint(active.id);
    return attempt ? toTraineeAttempt(attempt) : null;
  };

  saveAnswer = async (
    traineeId: string,
    attemptId: string,
    questionId: string,
    body: SaveAnswerBody
  ): Promise<SaveCheckpointAnswerResponse> => {
    const now = new Date();
    const attempt = await repository.findAttemptWithCheckpoint(attemptId);
    if (!attempt || attempt.trainee_id !== traineeId) throw new NotFoundError('Attempt not found.');

    if (attempt.status !== 'IN_PROGRESS') {
      throw new CheckpointAttemptFinalizedError();
    }
    if (attempt.deadline_at.getTime() <= now.getTime()) {
      await publishSubmitted(
        await repository.finalizeAttempt(attemptId, 'TIME_EXPIRED', now),
        traineeId
      );
      throw new CheckpointExpiredError();
    }

    const question = attempt.checkpoint.questions.find((item) => item.id === questionId);
    if (!question) throw new NotFoundError('Question not found.');

    if (question.type === 'MULTIPLE_CHOICE' && body.selectedOption) {
      const options = Array.isArray(question.options)
        ? question.options.filter((option): option is string => typeof option === 'string')
        : [];
      if (!options.includes(body.selectedOption)) {
        throw new ValidationError([
          { path: ['selectedOption'], message: 'Choose one of the listed options.' },
        ]);
      }
    }

    if (question.type !== 'PRACTICAL' && (body.files !== undefined || body.clearFiles)) {
      throw new ValidationError([
        { path: ['files'], message: 'Workspace files are only accepted for practical questions.' },
      ]);
    }

    const fields: Parameters<CheckpointRepository['saveAnswer']>[0]['fields'] = {};
    if (body.answerText !== undefined) fields.answer_text = body.answerText;
    if (body.selectedOption !== undefined) fields.selected_option = body.selectedOption;

    if (body.file) {
      fields.file_name = body.file.name;
      fields.file_mime_type = body.file.mimeType;
      fields.file_size = body.file.size;
      fields.file_data = body.file.dataBase64;
    } else if (body.clearFile) {
      fields.file_name = null;
      fields.file_mime_type = null;
      fields.file_size = null;
      fields.file_data = null;
    }

    if (body.files !== undefined) {
      fields.workspace_files = body.files;
    } else if (body.clearFiles) {
      fields.workspace_files = null;
    }

    const saved = await repository.saveAnswer({
      attemptId,
      questionId,
      clientRevision: body.clientRevision,
      fields,
      now,
    });
    await repository.touchAttempt(attemptId, now);

    return {
      questionId,
      clientRevision: saved.clientRevision,
      savedAt: saved.savedAt.toISOString(),
      stale: saved.stale,
    };
  };

  submit = async (
    traineeId: string,
    attemptId: string
  ): Promise<SubmitCheckpointAttemptResponse> => {
    const now = new Date();
    const attempt = await repository.findAttemptWithCheckpoint(attemptId);
    if (!attempt || attempt.trainee_id !== traineeId) throw new NotFoundError('Attempt not found.');

    if (attempt.status === 'SUBMITTED') {
      return toSubmitResponse(await repository.findAttemptDetail(attemptId), attempt.checkpoint);
    }

    if (now.getTime() >= attempt.deadline_at.getTime()) {
      const finalized = await repository.finalizeAttempt(attemptId, 'TIME_EXPIRED', now);
      await publishSubmitted(finalized, traineeId);
      return toSubmitResponse(finalized, attempt.checkpoint);
    }

    if (!attempt.checkpoint.allow_early_submission) {
      throw new AppError(
        403,
        'CHECKPOINT_EARLY_SUBMISSION_DISABLED',
        'Early submission is not allowed for this checkpoint. Your answers will be submitted when time expires.'
      );
    }

    const finalized = await repository.finalizeAttempt(attemptId, 'MANUAL', now);
    await publishSubmitted(finalized, traineeId);
    return toSubmitResponse(finalized, attempt.checkpoint);
  };

  getTime = async (traineeId: string, attemptId: string): Promise<CheckpointAttemptTime> => {
    const now = new Date();
    let attempt = await repository.findAttempt(attemptId);
    if (!attempt || attempt.trainee_id !== traineeId) throw new NotFoundError('Attempt not found.');

    if (attempt.status === 'IN_PROGRESS' && attempt.deadline_at.getTime() <= now.getTime()) {
      await publishSubmitted(
        await repository.finalizeAttempt(attemptId, 'TIME_EXPIRED', now),
        traineeId
      );
      attempt = await repository.findAttempt(attemptId);
      if (!attempt) throw new NotFoundError('Attempt not found.');
    }

    return {
      serverNow: now.toISOString(),
      deadlineAt: attempt.deadline_at.toISOString(),
      remainingSeconds: remainingSeconds(attempt.deadline_at, now),
      status: attempt.status,
      submittedAt: attempt.submitted_at?.toISOString() ?? null,
      submissionReason: attempt.submission_reason,
    };
  };

  getResult = async (traineeId: string, attemptId: string): Promise<CheckpointResult> => {
    const detail = await repository.findVisibleResult(attemptId, traineeId);
    if (!detail) throw new NotFoundError('Attempt not found.');
    const result = toCheckpointResult(detail);
    if (!result.visible) {
      throw new AppError(
        403,
        'CHECKPOINT_RESULTS_NOT_READY',
        'Your result is not available yet. It will appear after your manager publishes it.'
      );
    }
    return result;
  };
}
