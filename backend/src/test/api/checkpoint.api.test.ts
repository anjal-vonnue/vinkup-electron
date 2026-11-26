import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  CheckpointAttemptTime,
  CheckpointGroup,
  CheckpointResult,
  ManagerCheckpointAttemptDetail,
  ManagerCheckpointAttemptSummary,
  ManagerCheckpointDetail,
  ManagerCheckpointSummary,
  SaveCheckpointAnswerResponse,
  SubmitCheckpointAttemptResponse,
  TraineeCheckpointAttempt,
  TraineeCheckpointDetail,
  TraineeCheckpointSummary,
} from '@itp/types';
import { db } from './helpers/db';
import {
  createManager,
  freshTrainees,
  seedCurriculum,
  type TestAdmin,
  type TestTrainee,
} from './helpers/fixtures';
import { api, body, expectError } from './helpers/http';

const PAPER = `# JavaScript checkpoint

Answer every question.

## Question 1: Choose the clause
Type: multiple_choice
Marks: 5
Choices: WHERE | ORDER BY | GROUP BY
Correct: B

Which clause sorts a result set?

## Question 2: Explain closures
Marks: 5

Explain a closure in your own words.
`;

const MCQ_PAPER = `# MCQ checkpoint

## Question 1: Choose the clause
Type: multiple_choice
Marks: 5
Choices: WHERE | ORDER BY | GROUP BY
Correct: B

Which clause sorts a result set?
`;

let a: TestTrainee;
let b: TestTrainee;
let manager: TestAdmin;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
  manager = await createManager('Checkpoint Manager');
});

type CheckpointOverrides = {
  title?: string;
  startAt?: string;
  durationMinutes?: number;
  totalMarks?: number;
  passingMarks?: number;
  allowEarlySubmission?: boolean;
  allowLateEntry?: boolean;
  resultVisibility?: 'IMMEDIATE' | 'AFTER_APPROVAL';
  traineeIds?: string[];
  groupIds?: string[];
  maxAttempts?: number;
  markdown?: string;
};

async function createCheckpoint(
  overrides: CheckpointOverrides = {}
): Promise<ManagerCheckpointDetail> {
  const res = await api.post(
    '/api/manager/checkpoints',
    {
      title: overrides.title ?? 'JavaScript checkpoint',
      description: 'A short assessment',
      durationMinutes: overrides.durationMinutes ?? 60,
      totalMarks: overrides.totalMarks ?? 10,
      passingMarks: overrides.passingMarks ?? 5,
      startAt: overrides.startAt ?? new Date(Date.now() - 60_000).toISOString(),
      maxAttempts: overrides.maxAttempts ?? 1,
      allowEarlySubmission: overrides.allowEarlySubmission ?? true,
      allowLateEntry: overrides.allowLateEntry ?? true,
      resultVisibility: overrides.resultVisibility ?? 'AFTER_APPROVAL',
      sourceMarkdown: overrides.markdown ?? PAPER,
      traineeIds: overrides.traineeIds ?? [a.id],
      groupIds: overrides.groupIds ?? [],
    },
    manager.cookie
  );

  expect(res.status).toBe(201);
  return body<ManagerCheckpointDetail>(res);
}

async function publish(checkpointId: string): Promise<ManagerCheckpointDetail> {
  const res = await api.post(
    `/api/manager/checkpoints/${checkpointId}/publish`,
    {},
    manager.cookie
  );
  expect(res.status).toBe(200);
  return body<ManagerCheckpointDetail>(res);
}

async function createScheduledCheckpoint(
  overrides: CheckpointOverrides = {}
): Promise<ManagerCheckpointDetail> {
  const checkpoint = await createCheckpoint(overrides);
  return publish(checkpoint.id);
}

async function startAttempt(
  trainee: TestTrainee,
  checkpointId: string
): Promise<TraineeCheckpointAttempt> {
  const res = await api.post(`/api/checkpoints/${checkpointId}/start`, {}, trainee.cookie);
  expect(res.status).toBe(201);
  return body<TraineeCheckpointAttempt>(res);
}

function questionIds(attempt: TraineeCheckpointAttempt) {
  return attempt.questions.map((question) => question.id);
}

describe('checkpoint manager API', () => {
  it('previews a Markdown paper without saving it', async () => {
    const res = await api.post(
      '/api/manager/checkpoints/preview',
      { markdown: PAPER },
      manager.cookie
    );

    expect(res.status).toBe(200);
    expect(body<{ questions: unknown[]; totalQuestionMarks: number }>(res)).toMatchObject({
      totalQuestionMarks: 10,
    });
    expect(body<{ questions: Array<{ type: string }> }>(res).questions[0].type).toBe(
      'MULTIPLE_CHOICE'
    );
  });

  it('creates a draft, publishes it and lists it for the manager', async () => {
    const created = await createCheckpoint();

    expect(created.status).toBe('DRAFT');
    expect(created.questions).toHaveLength(2);
    expect(created.assignment.traineeIds).toEqual([a.id]);

    const scheduled = await publish(created.id);
    expect(scheduled.status).toBe('SCHEDULED');

    const list = await api.get('/api/manager/checkpoints', manager.cookie);
    const rows = body<ManagerCheckpointSummary[]>(list);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: created.id,
      status: 'SCHEDULED',
      assignedCount: 1,
      attemptCount: 0,
    });
  });

  it('validates marks, assignments and start dates before publishing', async () => {
    const noStart = await createCheckpoint({ startAt: undefined, traineeIds: [a.id] });
    await db.checkpoint.update({ where: { id: noStart.id }, data: { start_at: null } });
    expectError(
      await api.post(`/api/manager/checkpoints/${noStart.id}/publish`, {}, manager.cookie),
      400,
      'VALIDATION_FAILED'
    );

    const unassigned = await createCheckpoint({ traineeIds: [] });
    expectError(
      await api.post(`/api/manager/checkpoints/${unassigned.id}/publish`, {}, manager.cookie),
      400,
      'VALIDATION_FAILED'
    );

    const tooMany = await api.post(
      '/api/manager/checkpoints',
      {
        title: 'Too many marks',
        description: '',
        durationMinutes: 30,
        totalMarks: 4,
        passingMarks: 2,
        sourceMarkdown: PAPER,
      },
      manager.cookie
    );
    expectError(tooMany, 400, 'VALIDATION_FAILED');
  });

  it('refuses to edit a checkpoint that already has attempts', async () => {
    const scheduled = await createScheduledCheckpoint();
    await startAttempt(a, scheduled.id);

    expectError(
      await api.patch(
        `/api/manager/checkpoints/${scheduled.id}`,
        { title: 'Renamed checkpoint' },
        manager.cookie
      ),
      409,
      'CHECKPOINT_NOT_AVAILABLE'
    );
  });

  it('cancels a checkpoint and finalises a running attempt', async () => {
    const scheduled = await createScheduledCheckpoint();
    const attempt = await startAttempt(a, scheduled.id);

    const res = await api.post(
      `/api/manager/checkpoints/${scheduled.id}/cancel`,
      {},
      manager.cookie
    );
    expect(res.status).toBe(200);
    expect(body<ManagerCheckpointDetail>(res).status).toBe('CANCELLED');

    const row = await db.checkpoint_attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(row.status).toBe('SUBMITTED');
    expect(row.submission_reason).toBe('CANCELLED');
  });
});

describe('checkpoint trainee API', () => {
  it('lists and opens a scheduled checkpoint assigned directly to the trainee', async () => {
    const scheduled = await createScheduledCheckpoint();

    const listRes = await api.get('/api/checkpoints', a.cookie);
    const list = body<TraineeCheckpointSummary[]>(listRes);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: scheduled.id,
      availability: 'AVAILABLE',
      canStart: true,
      attempt: null,
    });

    const detailRes = await api.get(`/api/checkpoints/${scheduled.id}`, a.cookie);
    const detail = body<TraineeCheckpointDetail>(detailRes);
    expect(detail.instructionsMarkdown).toContain('Answer every question.');
    expect(detail.maxAttempts).toBe(1);

    expect((await api.get('/api/checkpoints', b.cookie)).body).toEqual([]);
  });

  it('assigns a checkpoint through a group', async () => {
    const groupRes = await api.post(
      '/api/manager/checkpoint-groups',
      { name: 'Batch A', traineeIds: [b.id] },
      manager.cookie
    );
    expect(groupRes.status).toBe(201);
    const group = body<CheckpointGroup>(groupRes);
    expect(group.members).toEqual([{ id: b.id, name: b.name, email: b.email, isActive: true }]);

    const scheduled = await createScheduledCheckpoint({ traineeIds: [], groupIds: [group.id] });

    const list = body<TraineeCheckpointSummary[]>(await api.get('/api/checkpoints', b.cookie));
    expect(list.map((row) => row.id)).toEqual([scheduled.id]);

    expectError(
      await api.post(
        '/api/manager/checkpoint-groups',
        { name: 'Batch A', traineeIds: [] },
        manager.cookie
      ),
      409,
      'CHECKPOINT_NOT_AVAILABLE'
    );
  });

  it('skips deactivated group members when assigning and publishing', async () => {
    const groupRes = await api.post(
      '/api/manager/checkpoint-groups',
      { name: 'Mixed batch', traineeIds: [a.id, b.id] },
      manager.cookie
    );
    expect(groupRes.status).toBe(201);
    const group = body<CheckpointGroup>(groupRes);

    const draft = await createCheckpoint({
      traineeIds: [],
      groupIds: [group.id],
    });

    await api.patch(`/api/manager/trainees/${b.id}/status`, { isActive: false }, manager.cookie);

    const list = body<ManagerCheckpointSummary[]>(
      await api.get('/api/manager/checkpoints', manager.cookie)
    );
    expect(list.find((row) => row.id === draft.id)?.assignedCount).toBe(1);

    const groups = body<CheckpointGroup[]>(
      await api.get('/api/manager/checkpoint-groups', manager.cookie)
    );
    expect(groups.find((row) => row.id === group.id)?.members).toEqual([
      expect.objectContaining({ id: a.id, isActive: true }),
      expect.objectContaining({ id: b.id, isActive: false }),
    ]);

    const scheduled = await publish(draft.id);
    expect(scheduled.status).toBe('SCHEDULED');
  });

  it('refuses to publish when every group member is deactivated', async () => {
    const groupRes = await api.post(
      '/api/manager/checkpoint-groups',
      { name: 'Deactivated batch', traineeIds: [b.id] },
      manager.cookie
    );
    const group = body<CheckpointGroup>(groupRes);
    const draft = await createCheckpoint({ traineeIds: [], groupIds: [group.id] });

    await api.patch(`/api/manager/trainees/${b.id}/status`, { isActive: false }, manager.cookie);

    expectError(
      await api.post(`/api/manager/checkpoints/${draft.id}/publish`, {}, manager.cookie),
      400,
      'VALIDATION_FAILED'
    );
  });

  it('does not allow starting before the scheduled time', async () => {
    const scheduled = await createScheduledCheckpoint({
      startAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    });

    expectError(
      await api.post(`/api/checkpoints/${scheduled.id}/start`, {}, a.cookie),
      403,
      'CHECKPOINT_NOT_AVAILABLE'
    );
  });

  it('does not allow late entry when it is disabled', async () => {
    const scheduled = await createScheduledCheckpoint({
      startAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      allowLateEntry: false,
    });

    expectError(
      await api.post(`/api/checkpoints/${scheduled.id}/start`, {}, a.cookie),
      403,
      'CHECKPOINT_NOT_AVAILABLE'
    );
  });

  it('runs the full assessment and grading flow', async () => {
    const scheduled = await createScheduledCheckpoint();
    const attempt = await startAttempt(a, scheduled.id);
    const [mcqId, textId] = questionIds(attempt);

    expect(attempt.answers).toHaveLength(2);

    // First write wins.
    const first = await api.put(
      `/api/checkpoints/attempts/${attempt.id}/answers/${mcqId}`,
      { clientRevision: 1, selectedOption: 'ORDER BY' },
      a.cookie
    );
    expect(first.status).toBe(200);
    expect(body<SaveCheckpointAnswerResponse>(first)).toMatchObject({
      clientRevision: 1,
      stale: false,
    });

    // A delayed retry with the same revision must not overwrite the answer.
    const stale = await api.put(
      `/api/checkpoints/attempts/${attempt.id}/answers/${mcqId}`,
      { clientRevision: 1, selectedOption: 'WHERE' },
      a.cookie
    );
    expect(body<SaveCheckpointAnswerResponse>(stale)).toMatchObject({
      clientRevision: 1,
      stale: true,
    });

    await api.put(
      `/api/checkpoints/attempts/${attempt.id}/answers/${textId}`,
      { clientRevision: 2, answerText: 'A closure captures its lexical scope.' },
      a.cookie
    );

    const submit = await api.post(`/api/checkpoints/attempts/${attempt.id}/submit`, {}, a.cookie);
    expect(submit.status).toBe(200);
    expect(body<SubmitCheckpointAttemptResponse>(submit)).toMatchObject({
      status: 'SUBMITTED',
      submissionReason: 'MANUAL',
      totalScore: null,
      resultVisible: false,
    });

    // The attempt no longer accepts answers.
    expectError(
      await api.put(
        `/api/checkpoints/attempts/${attempt.id}/answers/${textId}`,
        { clientRevision: 9, answerText: 'late' },
        a.cookie
      ),
      409,
      'CHECKPOINT_ATTEMPT_FINALIZED'
    );

    expectError(
      await api.get(`/api/checkpoints/attempts/${attempt.id}/result`, a.cookie),
      403,
      'CHECKPOINT_RESULTS_NOT_READY'
    );

    const attemptsRes = await api.get(
      `/api/manager/checkpoints/${scheduled.id}/attempts`,
      manager.cookie
    );
    const attempts = body<ManagerCheckpointAttemptSummary[]>(attemptsRes);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ traineeId: a.id, status: 'SUBMITTED' });

    const detailRes = await api.get(
      `/api/manager/checkpoints/attempts/${attempt.id}`,
      manager.cookie
    );
    const detail = body<ManagerCheckpointAttemptDetail>(detailRes);
    expect(detail.answers.find((answer) => answer.questionId === mcqId)).toMatchObject({
      selectedOption: 'ORDER BY',
      // The multiple-choice answer is scored on submission, but the paper still
      // waits for a manager because the written answer needs review.
      awardedMarks: 5,
    });
    expect(detail.totalScore).toBeNull();
    expect(detail.gradedAt).toBeNull();

    const gradeRes = await api.post(
      `/api/manager/checkpoints/attempts/${attempt.id}/grade`,
      {
        marks: [
          { questionId: mcqId, awardedMarks: 5 },
          { questionId: textId, awardedMarks: 4 },
        ],
        feedback: 'Good answer.',
      },
      manager.cookie
    );
    expect(gradeRes.status).toBe(200);
    expect(body<ManagerCheckpointAttemptDetail>(gradeRes)).toMatchObject({
      totalScore: 9,
      percentage: 90,
      passed: true,
      feedback: 'Good answer.',
    });

    // Graded, but still hidden until results are published.
    expectError(
      await api.get(`/api/checkpoints/attempts/${attempt.id}/result`, a.cookie),
      403,
      'CHECKPOINT_RESULTS_NOT_READY'
    );

    await api.post(`/api/manager/checkpoints/${scheduled.id}/publish-results`, {}, manager.cookie);

    const resultRes = await api.get(`/api/checkpoints/attempts/${attempt.id}/result`, a.cookie);
    expect(resultRes.status).toBe(200);
    const result = body<CheckpointResult>(resultRes);
    expect(result).toMatchObject({
      score: 9,
      totalMarks: 10,
      percentage: 90,
      passed: true,
      visible: true,
    });
    expect(result.answers).toHaveLength(2);
  });

  it('auto-grades an all-multiple-choice attempt on submission', async () => {
    const scheduled = await createScheduledCheckpoint({
      markdown: MCQ_PAPER,
      totalMarks: 5,
      passingMarks: 3,
      resultVisibility: 'IMMEDIATE',
    });
    const attempt = await startAttempt(a, scheduled.id);
    const [questionId] = questionIds(attempt);

    await api.put(
      `/api/checkpoints/attempts/${attempt.id}/answers/${questionId}`,
      { clientRevision: 1, selectedOption: 'ORDER BY' },
      a.cookie
    );

    const submit = await api.post(`/api/checkpoints/attempts/${attempt.id}/submit`, {}, a.cookie);
    expect(submit.status).toBe(200);
    const submitted = body<SubmitCheckpointAttemptResponse>(submit);
    expect(submitted).toMatchObject({
      status: 'SUBMITTED',
      totalScore: 5,
      percentage: 100,
      passed: true,
      resultVisible: true,
    });
    expect(submitted.gradedAt).not.toBeNull();

    const result = body<CheckpointResult>(
      await api.get(`/api/checkpoints/attempts/${attempt.id}/result`, a.cookie)
    );
    expect(result).toMatchObject({
      score: 5,
      totalMarks: 5,
      percentage: 100,
      passed: true,
      visible: true,
    });
    expect(result.answers[0]).toMatchObject({
      selectedOption: 'ORDER BY',
      awardedMarks: 5,
    });
  });

  it('awards no marks for an incorrect multiple-choice answer', async () => {
    const scheduled = await createScheduledCheckpoint({
      markdown: MCQ_PAPER,
      totalMarks: 5,
      passingMarks: 3,
      resultVisibility: 'IMMEDIATE',
    });
    const attempt = await startAttempt(a, scheduled.id);
    const [questionId] = questionIds(attempt);

    await api.put(
      `/api/checkpoints/attempts/${attempt.id}/answers/${questionId}`,
      { clientRevision: 1, selectedOption: 'WHERE' },
      a.cookie
    );

    const submit = await api.post(`/api/checkpoints/attempts/${attempt.id}/submit`, {}, a.cookie);
    expect(body<SubmitCheckpointAttemptResponse>(submit)).toMatchObject({
      totalScore: 0,
      percentage: 0,
      passed: false,
      resultVisible: true,
    });

    const result = body<CheckpointResult>(
      await api.get(`/api/checkpoints/attempts/${attempt.id}/result`, a.cookie)
    );
    expect(result.answers[0]).toMatchObject({ awardedMarks: 0 });
  });

  it('stores practical workspace files and returns them to the manager and result', async () => {
    const practicalPaper = `# Practical checkpoint

## Question 1: Build the greeting
Type: practical
Marks: 10
Runtime: node
Run: npm test

Write the greeting.

\`\`\`html file=index.html
<h1>Start</h1>
\`\`\`
`;
    const scheduled = await createScheduledCheckpoint({ markdown: practicalPaper });
    const attempt = await startAttempt(a, scheduled.id);
    const [questionId] = questionIds(attempt);

    expect(attempt.questions[0]).toMatchObject({
      type: 'PRACTICAL',
      runtime: 'node',
      runCommand: 'npm test',
      starterFiles: [{ path: 'index.html', content: '<h1>Start</h1>' }],
    });

    const files = [
      { path: 'index.html', content: '<h1>Done</h1>' },
      { path: 'app.js', content: 'console.log("done");' },
    ];
    const save = await api.put(
      `/api/checkpoints/attempts/${attempt.id}/answers/${questionId}`,
      { clientRevision: 1, files },
      a.cookie
    );
    expect(save.status).toBe(200);

    const refreshed = body<TraineeCheckpointAttempt>(
      await api.get(`/api/checkpoints/attempts/${attempt.id}`, a.cookie)
    );
    expect(refreshed.answers.find((answer) => answer.questionId === questionId)?.files).toEqual(
      files
    );

    await api.post(`/api/checkpoints/attempts/${attempt.id}/submit`, {}, a.cookie);

    const detail = body<ManagerCheckpointAttemptDetail>(
      await api.get(`/api/manager/checkpoints/attempts/${attempt.id}`, manager.cookie)
    );
    expect(detail.answers.find((answer) => answer.questionId === questionId)?.files).toEqual(files);

    await api.post(
      `/api/manager/checkpoints/attempts/${attempt.id}/grade`,
      { marks: [{ questionId, awardedMarks: 8 }] },
      manager.cookie
    );
    await api.post(`/api/manager/checkpoints/${scheduled.id}/publish-results`, {}, manager.cookie);

    const result = body<CheckpointResult>(
      await api.get(`/api/checkpoints/attempts/${attempt.id}/result`, a.cookie)
    );
    expect(result.answers[0].files).toEqual(files);
  });

  it('rejects a manual submit when early submission is disabled', async () => {
    const scheduled = await createScheduledCheckpoint({ allowEarlySubmission: false });
    const attempt = await startAttempt(a, scheduled.id);

    expectError(
      await api.post(`/api/checkpoints/attempts/${attempt.id}/submit`, {}, a.cookie),
      403,
      'CHECKPOINT_EARLY_SUBMISSION_DISABLED'
    );
  });

  it('finalises an expired attempt on the server without the browser', async () => {
    const scheduled = await createScheduledCheckpoint();
    const attempt = await startAttempt(a, scheduled.id);
    const deadline = new Date(Date.now() - 5_000);

    await db.checkpoint_attempt.update({
      where: { id: attempt.id },
      data: {
        started_at: new Date(Date.now() - 2 * 60 * 60_000),
        deadline_at: deadline,
      },
    });

    // The next write is refused because the server-owned deadline has passed.
    expectError(
      await api.put(
        `/api/checkpoints/attempts/${attempt.id}/answers/${questionIds(attempt)[0]}`,
        { clientRevision: 2, selectedOption: 'WHERE' },
        a.cookie
      ),
      409,
      'CHECKPOINT_EXPIRED'
    );

    const timeRes = await api.get(`/api/checkpoints/attempts/${attempt.id}/time`, a.cookie);
    const time = body<CheckpointAttemptTime>(timeRes);
    expect(time.status).toBe('SUBMITTED');
    expect(time.submissionReason).toBe('TIME_EXPIRED');
    expect(time.remainingSeconds).toBe(0);

    const row = await db.checkpoint_attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(row.submitted_at?.toISOString()).toBe(deadline.toISOString());

    const active = body<TraineeCheckpointAttempt | null>(
      await api.get('/api/checkpoints/attempts/active', a.cookie)
    );
    expect(active).toBeNull();
  });

  it('locks the rest of the trainee app while an attempt is active', async () => {
    const scheduled = await createScheduledCheckpoint();
    const attempt = await startAttempt(a, scheduled.id);

    const dashboard = await api.get('/api/dashboard', a.cookie);
    expect(dashboard.status).toBe(423);
    expect(
      body<{ error: { code: string; details?: { attemptId?: string } } }>(dashboard).error
    ).toMatchObject({ code: 'CHECKPOINT_ACTIVE', details: { attemptId: attempt.id } });

    const activeRes = await api.get('/api/checkpoints/attempts/active', a.cookie);
    expect(body<TraineeCheckpointAttempt>(activeRes).id).toBe(attempt.id);

    // A second checkpoint cannot be started at the same time.
    const other = await createScheduledCheckpoint({ title: 'Second checkpoint' });
    expectError(
      await api.post(`/api/checkpoints/${other.id}/start`, {}, a.cookie),
      423,
      'CHECKPOINT_ACTIVE'
    );

    // After submitting, the app opens again.
    await api.post(`/api/checkpoints/attempts/${attempt.id}/submit`, {}, a.cookie);
    expect((await api.get('/api/dashboard', a.cookie)).status).toBe(200);
  });

  it("does not expose another trainee's attempt", async () => {
    const scheduled = await createScheduledCheckpoint();
    const attempt = await startAttempt(a, scheduled.id);

    expectError(
      await api.get(`/api/checkpoints/attempts/${attempt.id}`, b.cookie),
      404,
      'NOT_FOUND'
    );
    expectError(
      await api.post(`/api/checkpoints/attempts/${attempt.id}/submit`, {}, b.cookie),
      404,
      'NOT_FOUND'
    );
    expectError(await api.get('/api/manager/checkpoints', a.cookie), 403, 'FORBIDDEN');
    expectError(
      await api.post(`/api/checkpoints/${scheduled.id}/start`, {}, manager.cookie),
      403,
      'FORBIDDEN'
    );
  });
});
