import type {
  CheckpointAvailability,
  CheckpointQuestion,
  CheckpointQuestionRuntime,
  CheckpointQuestionType,
  CheckpointResult,
  CheckpointResultVisibility,
  CheckpointSubmissionReason,
  CheckpointWorkspaceFile,
  ManagerCheckpointAttemptDetail,
  ManagerCheckpointAttemptSummary,
  ManagerCheckpointAnswer,
  ManagerCheckpointDetail,
  ManagerCheckpointSummary,
  TraineeCheckpointAttempt,
  TraineeCheckpointAttemptSummary,
  TraineeCheckpointDetail,
  TraineeCheckpointSummary,
} from '@itp/types';
import type {
  AttemptDetailRow,
  AttemptSummaryRow,
  CheckpointDetailRow,
  CheckpointRepository,
  CheckpointSummaryRow,
} from './checkpoint.repository';

type TraineeListRow = Awaited<ReturnType<CheckpointRepository['listTraineeCheckpoints']>>[number];
type TraineeDetailRow = NonNullable<
  Awaited<ReturnType<CheckpointRepository['findTraineeCheckpoint']>>
>;
type StartedAttemptRow = Awaited<ReturnType<CheckpointRepository['startAttempt']>>;
type AttemptWithCheckpointRow = NonNullable<
  Awaited<ReturnType<CheckpointRepository['findAttemptWithCheckpoint']>>
>;

/** How long after the scheduled start a trainee may still enter when late entry is off. */
export const LATE_ENTRY_GRACE_MS = 10 * 60 * 1000;

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function percentageOf(score: number | null, totalMarks: number): number | null {
  if (score === null || totalMarks <= 0) return null;
  return roundOne((score / totalMarks) * 100);
}

export function isResultVisible(input: {
  resultVisibility: CheckpointResultVisibility;
  resultsPublishedAt: Date | null;
  gradedAt: Date | null;
}): boolean {
  return Boolean(
    input.gradedAt && (input.resultVisibility === 'IMMEDIATE' || input.resultsPublishedAt !== null)
  );
}

type AssignmentRow = {
  trainee_id: string | null;
  group: {
    members: Array<{ trainee_id: string; trainee: { is_active: boolean } }>;
  } | null;
};

/**
 * Every trainee the checkpoint actually reaches, directly or through a group.
 * Deactivated group members are skipped: they cannot log in, so they must not
 * count towards the assignment or block publishing. Reactivating them makes
 * them count again without touching the group.
 */
export function assignedTraineeIds(assignments: AssignmentRow[]): Set<string> {
  const ids = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.trainee_id) ids.add(assignment.trainee_id);
    for (const member of assignment.group?.members ?? []) {
      if (member.trainee.is_active) ids.add(member.trainee_id);
    }
  }
  return ids;
}

export function assignedTraineeCount(assignments: AssignmentRow[]): number {
  return assignedTraineeIds(assignments).size;
}

export function toManagerSummary(row: CheckpointSummaryRow): ManagerCheckpointSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    mode: row.mode,
    status: row.status,
    startAt: iso(row.start_at),
    durationMinutes: row.duration_minutes,
    totalMarks: row.total_marks,
    passingMarks: row.passing_marks,
    maxAttempts: row.max_attempts,
    allowEarlySubmission: row.allow_early_submission,
    allowLateEntry: row.allow_late_entry,
    resultVisibility: row.result_visibility,
    resultsPublishedAt: iso(row.results_published_at),
    assignedCount: assignedTraineeCount(row.assignments),
    attemptCount: row._count.attempts,
    submittedCount: row.attempts.filter((attempt) => attempt.status === 'SUBMITTED').length,
    gradedCount: row.attempts.filter((attempt) => attempt.graded_at !== null).length,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toQuestion(row: {
  id: string;
  order_index: number;
  title: string;
  prompt_markdown: string;
  type: string;
  marks: number;
  options: unknown;
  correct_option: string | null;
  code_language: string | null;
  runtime: string | null;
  run_command: string | null;
  setup_sql: string | null;
  starter_files: unknown;
}): CheckpointQuestion {
  return {
    id: row.id,
    orderIndex: row.order_index,
    title: row.title,
    promptMarkdown: row.prompt_markdown,
    type: row.type as CheckpointQuestionType,
    marks: row.marks,
    options: Array.isArray(row.options)
      ? row.options.filter((option): option is string => typeof option === 'string')
      : null,
    correctOption: row.correct_option,
    codeLanguage: row.code_language,
    runtime: (row.runtime as CheckpointQuestionRuntime | null) ?? null,
    runCommand: row.run_command,
    setupSql: row.setup_sql,
    starterFiles: toWorkspaceFiles(row.starter_files),
  };
}

/** JSON columns cross the database boundary untyped; keep only well-formed entries. */
function toWorkspaceFiles(value: unknown): CheckpointWorkspaceFile[] | null {
  if (!Array.isArray(value)) return null;

  const files: CheckpointWorkspaceFile[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.path !== 'string' || typeof record.content !== 'string') continue;
    files.push({ path: record.path, content: record.content });
  }
  return files.length > 0 ? files : null;
}

export function toManagerDetail(row: CheckpointDetailRow): ManagerCheckpointDetail {
  return {
    ...toManagerSummary(row),
    sourceFileName: row.source_file_name,
    sourceMarkdown: row.source_markdown,
    instructionsMarkdown: row.instructions_markdown,
    questions: row.questions.map(toQuestion),
    assignment: {
      traineeIds: row.assignments
        .map((assignment) => assignment.trainee_id)
        .filter((id): id is string => Boolean(id)),
      groupIds: row.assignments
        .map((assignment) => assignment.group_id)
        .filter((id): id is string => Boolean(id)),
    },
  };
}

function availabilityFor(input: {
  startAt: Date | null;
  durationMinutes: number;
  allowLateEntry: boolean;
  now: Date;
  latestAttempt:
    | {
        status: 'IN_PROGRESS' | 'SUBMITTED';
        deadline_at: Date;
        graded_at: Date | null;
        submitted_at: Date | null;
      }
    | undefined;
  resultVisibility: CheckpointResultVisibility;
  resultsPublishedAt: Date | null;
}): CheckpointAvailability {
  const { latestAttempt, now } = input;
  if (latestAttempt) {
    if (
      latestAttempt.status === 'IN_PROGRESS' &&
      latestAttempt.deadline_at.getTime() > now.getTime()
    ) {
      return 'IN_PROGRESS';
    }
    if (
      isResultVisible({
        resultVisibility: input.resultVisibility,
        resultsPublishedAt: input.resultsPublishedAt,
        gradedAt: latestAttempt.graded_at,
      })
    ) {
      return 'RESULTS_AVAILABLE';
    }
    return latestAttempt.graded_at ? 'AWAITING_RESULTS' : 'SUBMITTED';
  }

  if (!input.startAt) return 'UPCOMING';
  if (now.getTime() < input.startAt.getTime()) return 'UPCOMING';

  const windowEnd = input.startAt.getTime() + input.durationMinutes * 60_000;
  const lateEntryEnd = input.startAt.getTime() + LATE_ENTRY_GRACE_MS;
  if (now.getTime() >= windowEnd) return 'MISSED';
  if (!input.allowLateEntry && now.getTime() > lateEntryEnd) return 'MISSED';
  return 'AVAILABLE';
}

function attemptSummary(
  attempt: {
    id: string;
    attempt_number: number;
    status: 'IN_PROGRESS' | 'SUBMITTED';
    started_at: Date;
    deadline_at: Date;
    submitted_at: Date | null;
    submission_reason: CheckpointSubmissionReason | null;
    total_score: number | null;
    graded_at: Date | null;
  },
  checkpoint: {
    total_marks: number;
    passing_marks: number;
    result_visibility: string;
    results_published_at: Date | null;
  }
): TraineeCheckpointAttemptSummary {
  return {
    id: attempt.id,
    attemptNumber: attempt.attempt_number,
    status: attempt.status,
    startedAt: attempt.started_at.toISOString(),
    deadlineAt: attempt.deadline_at.toISOString(),
    submittedAt: iso(attempt.submitted_at),
    submissionReason: attempt.submission_reason,
    totalScore: attempt.total_score,
    percentage: percentageOf(attempt.total_score, checkpoint.total_marks),
    passed: attempt.total_score === null ? null : attempt.total_score >= checkpoint.passing_marks,
    gradedAt: iso(attempt.graded_at),
    resultVisible: isResultVisible({
      resultVisibility: checkpoint.result_visibility as CheckpointResultVisibility,
      resultsPublishedAt: checkpoint.results_published_at,
      gradedAt: attempt.graded_at,
    }),
  };
}

export function toTraineeSummary(row: TraineeListRow, now: Date): TraineeCheckpointSummary {
  const latest = row.attempts[0];
  const availability = availabilityFor({
    startAt: row.start_at,
    durationMinutes: row.duration_minutes,
    allowLateEntry: row.allow_late_entry,
    now,
    latestAttempt: latest,
    resultVisibility: row.result_visibility,
    resultsPublishedAt: row.results_published_at,
  });

  const attemptsUsed = row.attempts.length;
  const activeAttempt =
    latest?.status === 'IN_PROGRESS' && latest.deadline_at.getTime() > now.getTime();
  const canStart =
    availability === 'AVAILABLE' && attemptsUsed < row.max_attempts && Boolean(row.start_at);

  let blockedReason: string | null = null;
  if (availability === 'UPCOMING')
    blockedReason = `This checkpoint opens ${row.start_at ? row.start_at.toISOString() : 'soon'}.`;
  else if (availability === 'MISSED')
    blockedReason = 'The entry window for this checkpoint has closed.';
  else if (availability === 'IN_PROGRESS')
    blockedReason = 'You already have an attempt in progress.';
  else if (attemptsUsed >= row.max_attempts)
    blockedReason = 'You have used all available attempts.';
  else if (activeAttempt) blockedReason = 'You already have an attempt in progress.';

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startAt: (row.start_at ?? new Date()).toISOString(),
    durationMinutes: row.duration_minutes,
    totalMarks: row.total_marks,
    passingMarks: row.passing_marks,
    availability,
    serverNow: now.toISOString(),
    canStart,
    blockedReason,
    attempt: latest
      ? attemptSummary(latest, {
          total_marks: row.total_marks,
          passing_marks: row.passing_marks,
          result_visibility: row.result_visibility,
          results_published_at: row.results_published_at,
        })
      : null,
  };
}

export function toTraineeDetail(row: TraineeDetailRow, now: Date): TraineeCheckpointDetail {
  const latest = row.attempts[0];
  const base = toTraineeSummary(
    {
      ...row,
      attempts: row.attempts as TraineeListRow['attempts'],
    },
    now
  );

  return {
    ...base,
    instructionsMarkdown: row.instructions_markdown,
    allowEarlySubmission: row.allow_early_submission,
    allowLateEntry: row.allow_late_entry,
    maxAttempts: row.max_attempts,
    attemptsUsed: row.attempts.length,
    resultVisibility: row.result_visibility,
    resultsPublishedAt: iso(row.results_published_at),
    canStart: latest?.status === 'IN_PROGRESS' ? true : base.canStart,
    blockedReason:
      latest?.status === 'IN_PROGRESS' ? 'Resume your open attempt.' : base.blockedReason,
  };
}

export function toTraineeAttempt(
  row: StartedAttemptRow | AttemptWithCheckpointRow
): TraineeCheckpointAttempt {
  const checkpoint = row.checkpoint;
  const now = new Date();
  const remainingSeconds =
    row.status === 'IN_PROGRESS'
      ? Math.max(0, Math.floor((row.deadline_at.getTime() - now.getTime()) / 1000))
      : 0;

  return {
    id: row.id,
    checkpointId: checkpoint.id,
    checkpointTitle: checkpoint.title,
    instructionsMarkdown: checkpoint.instructions_markdown,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    deadlineAt: row.deadline_at.toISOString(),
    serverNow: now.toISOString(),
    remainingSeconds,
    submittedAt: iso(row.submitted_at),
    submissionReason: row.submission_reason,
    allowEarlySubmission: checkpoint.allow_early_submission,
    totalMarks: checkpoint.total_marks,
    passingMarks: checkpoint.passing_marks,
    attemptNumber: row.attempt_number,
    questions: checkpoint.questions.map(toQuestion),
    answers: row.answers.map((answer) => ({
      questionId: answer.question_id,
      answerText: answer.answer_text,
      selectedOption: answer.selected_option,
      fileName: answer.file_name,
      fileMimeType: answer.file_mime_type,
      fileSize: answer.file_size,
      files: toWorkspaceFiles(answer.workspace_files),
      clientRevision: answer.client_revision,
      savedAt: iso(answer.saved_at),
    })),
    result: null,
  };
}

export function toManagerAttemptSummary(
  row: AttemptSummaryRow,
  checkpoint: {
    total_marks: number;
    passing_marks: number;
    result_visibility: string;
    results_published_at: Date | null;
  }
): ManagerCheckpointAttemptSummary {
  return {
    id: row.id,
    traineeId: row.trainee_id,
    traineeName: row.trainee.name,
    traineeEmail: row.trainee.email,
    attemptNumber: row.attempt_number,
    status: row.status,
    startedAt: row.started_at.toISOString(),
    deadlineAt: row.deadline_at.toISOString(),
    submittedAt: iso(row.submitted_at),
    submissionReason: row.submission_reason,
    totalScore: row.total_score,
    percentage: percentageOf(row.total_score, checkpoint.total_marks),
    passed: row.total_score === null ? null : row.total_score >= checkpoint.passing_marks,
    gradedAt: iso(row.graded_at),
    resultVisible: isResultVisible({
      resultVisibility: checkpoint.result_visibility as CheckpointResultVisibility,
      resultsPublishedAt: checkpoint.results_published_at,
      gradedAt: row.graded_at,
    }),
  };
}

export function toManagerAttemptDetail(row: AttemptDetailRow): ManagerCheckpointAttemptDetail {
  const summary = toManagerAttemptSummary(row, row.checkpoint);
  const answers = new Map(row.answers.map((answer) => [answer.question_id, answer]));

  return {
    ...summary,
    checkpointId: row.checkpoint.id,
    checkpointTitle: row.checkpoint.title,
    checkpointTotalMarks: row.checkpoint.total_marks,
    feedback: row.feedback,
    gradedByName: row.graded_by?.name ?? null,
    questions: row.checkpoint.questions.map(toQuestion),
    answers: row.checkpoint.questions.map((question): ManagerCheckpointAnswer => {
      const answer = answers.get(question.id);
      return {
        questionId: question.id,
        answerText: answer?.answer_text ?? null,
        selectedOption: answer?.selected_option ?? null,
        fileName: answer?.file_name ?? null,
        fileMimeType: answer?.file_mime_type ?? null,
        fileSize: answer?.file_size ?? null,
        files: toWorkspaceFiles(answer?.workspace_files),
        awardedMarks: answer?.awarded_marks ?? null,
        feedback: answer?.feedback ?? null,
        savedAt: iso(answer?.saved_at),
      };
    }),
    events: row.events.map((event) => ({
      id: event.id,
      type: event.type,
      message: event.message,
      createdAt: event.created_at.toISOString(),
    })),
  };
}

export function toCheckpointResult(row: AttemptDetailRow): CheckpointResult {
  const visible = isResultVisible({
    resultVisibility: row.checkpoint.result_visibility,
    resultsPublishedAt: row.checkpoint.results_published_at,
    gradedAt: row.graded_at,
  });
  const answers = new Map(row.answers.map((answer) => [answer.question_id, answer]));

  return {
    attemptId: row.id,
    checkpointId: row.checkpoint.id,
    checkpointTitle: row.checkpoint.title,
    submittedAt: iso(row.submitted_at),
    submissionReason: row.submission_reason,
    totalMarks: row.checkpoint.total_marks,
    passingMarks: row.checkpoint.passing_marks,
    score: row.total_score,
    percentage: percentageOf(row.total_score, row.checkpoint.total_marks),
    passed: row.total_score === null ? null : row.total_score >= row.checkpoint.passing_marks,
    gradedAt: iso(row.graded_at),
    feedback: row.feedback,
    resultPublishedAt: iso(row.checkpoint.results_published_at),
    visible,
    answers: row.checkpoint.questions.map((question) => {
      const answer = answers.get(question.id);
      return {
        questionId: question.id,
        questionTitle: question.title,
        questionType: question.type,
        marks: question.marks,
        answerText: answer?.answer_text ?? null,
        selectedOption: answer?.selected_option ?? null,
        fileName: answer?.file_name ?? null,
        files: toWorkspaceFiles(answer?.workspace_files),
        awardedMarks: answer?.awarded_marks ?? null,
        feedback: answer?.feedback ?? null,
      };
    }),
  };
}
