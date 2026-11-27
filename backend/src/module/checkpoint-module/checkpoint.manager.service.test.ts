import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError, ValidationError } from '../../errors/AppError';

const repo = vi.hoisted(() => ({
  listCheckpoints: vi.fn(),
  findCheckpointDetail: vi.fn(),
  findCheckpointSummary: vi.fn(),
  createCheckpoint: vi.fn(),
  updateCheckpoint: vi.fn(),
  publishCheckpoint: vi.fn(),
  cancelCheckpoint: vi.fn(),
  publishResults: vi.fn(),
  countAttempts: vi.fn(),
  countGroups: vi.fn(),
  listAttemptsForCheckpoint: vi.fn(),
  findAttemptDetail: vi.fn(),
  findAttempt: vi.fn(),
  gradeAttempt: vi.fn(),
  findAnswerFile: vi.fn(),
  listGroups: vi.fn(),
  findGroup: vi.fn(),
  createGroup: vi.fn(),
  updateGroup: vi.fn(),
  deleteGroup: vi.fn(),
  findTrainees: vi.fn(),
}));

vi.mock('./checkpoint.repository', () => ({
  CheckpointRepository: class {
    listCheckpoints = repo.listCheckpoints;
    findCheckpointDetail = repo.findCheckpointDetail;
    findCheckpointSummary = repo.findCheckpointSummary;
    createCheckpoint = repo.createCheckpoint;
    updateCheckpoint = repo.updateCheckpoint;
    publishCheckpoint = repo.publishCheckpoint;
    cancelCheckpoint = repo.cancelCheckpoint;
    publishResults = repo.publishResults;
    countAttempts = repo.countAttempts;
    countGroups = repo.countGroups;
    listAttemptsForCheckpoint = repo.listAttemptsForCheckpoint;
    findAttemptDetail = repo.findAttemptDetail;
    findAttempt = repo.findAttempt;
    gradeAttempt = repo.gradeAttempt;
    findAnswerFile = repo.findAnswerFile;
    listGroups = repo.listGroups;
    findGroup = repo.findGroup;
    createGroup = repo.createGroup;
    updateGroup = repo.updateGroup;
    deleteGroup = repo.deleteGroup;
    findTrainees = repo.findTrainees;
  },
}));

vi.mock('./checkpoint.notify', () => ({
  publishCheckpointActivity: vi.fn(),
}));

import { CheckpointManagerService } from './checkpoint.manager.service';
import { publishCheckpointActivity } from './checkpoint.notify';
import { realtimeBroker } from '../realtime-module/realtime.broker';

const publishSpy = vi.spyOn(realtimeBroker, 'publish');

const managerId = 'manager-1';
const checkpointId = 'checkpoint-1';
const attemptId = 'attempt-1';

const PAPER = `# Checkpoint

Read every question carefully.

## Question 1: Pick one
Type: multiple_choice
Marks: 5
Choices: A | B
Correct: A

Which one?
`;

const question = {
  id: 'question-1',
  order_index: 1,
  title: 'Pick one',
  prompt_markdown: 'Which one?',
  type: 'MULTIPLE_CHOICE',
  marks: 5,
  options: ['A', 'B'],
  correct_option: 'A',
  code_language: null,
};

function checkpointRow(overrides: Record<string, unknown> = {}) {
  return {
    id: checkpointId,
    title: 'Assessment',
    description: '',
    status: 'DRAFT',
    start_at: null,
    duration_minutes: 60,
    total_marks: 10,
    passing_marks: 5,
    max_attempts: 1,
    allow_early_submission: true,
    allow_late_entry: true,
    result_visibility: 'AFTER_APPROVAL',
    results_published_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    source_file_name: null,
    source_markdown: PAPER,
    instructions_markdown: 'Read every question carefully.',
    questions: [question],
    assignments: [],
    attempts: [],
    _count: { attempts: 0 },
    ...overrides,
  };
}

function attemptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: attemptId,
    trainee_id: 'trainee-1',
    trainee: { name: 'Trainee One', email: 'trainee@example.com' },
    graded_by: null,
    attempt_number: 1,
    status: 'SUBMITTED',
    started_at: new Date(),
    deadline_at: new Date(),
    submitted_at: new Date(),
    submission_reason: 'MANUAL',
    total_score: null,
    graded_at: null,
    feedback: null,
    answers: [
      {
        question_id: question.id,
        answer_text: null,
        selected_option: 'A',
        file_name: null,
        file_mime_type: null,
        file_size: null,
        awarded_marks: null,
        feedback: null,
        saved_at: new Date(),
      },
    ],
    events: [],
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

const createBody = {
  title: 'Assessment',
  description: '',
  durationMinutes: 60,
  totalMarks: 10,
  passingMarks: 5,
  sourceMarkdown: PAPER,
};

describe('CheckpointManagerService', () => {
  let service: CheckpointManagerService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CheckpointManagerService();
    repo.findTrainees.mockImplementation((ids: string[]) => ids.map((id) => ({ id })));
    repo.countGroups.mockImplementation((_managerId: string, ids: string[]) =>
      Promise.resolve(ids.length)
    );
    repo.countAttempts.mockResolvedValue(0);
  });

  describe('list', () => {
    it('counts only active group members as assigned', async () => {
      repo.listCheckpoints.mockResolvedValue([
        checkpointRow({
          assignments: [
            {
              trainee_id: null,
              group_id: 'group-1',
              group: {
                members: [
                  { trainee_id: 't1', trainee: { is_active: true } },
                  { trainee_id: 't2', trainee: { is_active: false } },
                ],
              },
            },
          ],
        }),
      ]);

      const [summary] = await service.list();

      expect(summary.assignedCount).toBe(1);
    });
  });

  describe('create', () => {
    it('rejects a paper without any questions', async () => {
      await expect(
        service.create(managerId, {
          ...createBody,
          sourceMarkdown: 'Only instructions, no questions.',
        })
      ).rejects.toBeInstanceOf(ValidationError);
      expect(repo.createCheckpoint).not.toHaveBeenCalled();
    });

    it('rejects when the paper carries more marks than the total', async () => {
      await expect(
        service.create(managerId, { ...createBody, totalMarks: 3, passingMarks: 2 })
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('rejects passing marks above the total', async () => {
      await expect(
        service.create(managerId, { ...createBody, passingMarks: 11 })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects a trainee selection that no longer exists', async () => {
      repo.findTrainees.mockResolvedValue([]);

      await expect(
        service.create(managerId, { ...createBody, traineeIds: ['missing'] })
      ).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    });

    it('creates a draft and deduplicates the assignment selection', async () => {
      repo.createCheckpoint.mockResolvedValue(checkpointRow());

      const created = await service.create(managerId, {
        ...createBody,
        traineeIds: ['trainee-1', 'trainee-1'],
        groupIds: ['group-1', 'group-1'],
      });

      expect(created.id).toBe(checkpointId);
      expect(created.status).toBe('DRAFT');
      expect(repo.createCheckpoint).toHaveBeenCalledWith(
        managerId,
        expect.objectContaining({
          title: 'Assessment',
          total_marks: 10,
          passing_marks: 5,
          duration_minutes: 60,
          start_at: null,
          max_attempts: 1,
          allow_early_submission: true,
          allow_late_entry: true,
          result_visibility: 'AFTER_APPROVAL',
        }),
        [expect.objectContaining({ title: 'Pick one', type: 'MULTIPLE_CHOICE', marks: 5 })],
        { traineeIds: ['trainee-1'], groupIds: ['group-1'] }
      );
    });
  });

  describe('update', () => {
    it('rejects editing a cancelled checkpoint', async () => {
      repo.findCheckpointDetail.mockResolvedValue(checkpointRow({ status: 'CANCELLED' }));

      await expect(service.update(managerId, checkpointId, { title: 'New' })).rejects.toMatchObject(
        {
          code: 'CHECKPOINT_NOT_AVAILABLE',
        }
      );
    });

    it('rejects editing once a trainee has attempted it', async () => {
      repo.findCheckpointDetail.mockResolvedValue(checkpointRow());
      repo.countAttempts.mockResolvedValue(1);

      await expect(service.update(managerId, checkpointId, { title: 'New' })).rejects.toMatchObject(
        {
          code: 'CHECKPOINT_NOT_AVAILABLE',
        }
      );
      expect(repo.updateCheckpoint).not.toHaveBeenCalled();
    });

    it('merges partial fields over the stored checkpoint', async () => {
      repo.findCheckpointDetail.mockResolvedValue(checkpointRow());
      repo.updateCheckpoint.mockResolvedValue(checkpointRow({ title: 'Updated title' }));

      const updated = await service.update(managerId, checkpointId, { title: 'Updated title' });

      expect(updated.title).toBe('Updated title');
      expect(repo.updateCheckpoint).toHaveBeenCalledWith(
        checkpointId,
        expect.objectContaining({ title: 'Updated title', duration_minutes: 60 }),
        expect.any(Array),
        null
      );
    });
  });

  describe('publish', () => {
    it('requires a start date', async () => {
      repo.findCheckpointDetail.mockResolvedValue(checkpointRow({ start_at: null }));

      await expect(service.publish(managerId, checkpointId)).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('requires at least one trainee or group', async () => {
      repo.findCheckpointDetail.mockResolvedValue(
        checkpointRow({ start_at: new Date(), assignments: [] })
      );

      await expect(service.publish(managerId, checkpointId)).rejects.toBeInstanceOf(
        ValidationError
      );
    });

    it('publishes when a group supplies the trainees', async () => {
      const startAt = new Date(Date.now() + 60_000);
      repo.findCheckpointDetail.mockResolvedValue(
        checkpointRow({
          start_at: startAt,
          assignments: [
            {
              trainee_id: null,
              group_id: 'group-1',
              group: {
                members: [{ trainee_id: 't1', trainee: { is_active: true } }],
              },
            },
          ],
        })
      );
      repo.publishCheckpoint.mockResolvedValue(
        checkpointRow({ status: 'SCHEDULED', start_at: startAt })
      );

      const published = await service.publish(managerId, checkpointId);

      expect(published.status).toBe('SCHEDULED');
      expect(repo.publishCheckpoint).toHaveBeenCalledWith(checkpointId, startAt);
      expect(publishSpy).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ type: 'checkpoint.published', checkpointId })
      );
      expect(publishCheckpointActivity).toHaveBeenCalledWith({
        checkpointId,
        reason: 'PUBLISHED',
      });
    });

    it('publishes when a group still has at least one active member', async () => {
      const startAt = new Date(Date.now() + 60_000);
      repo.findCheckpointDetail.mockResolvedValue(
        checkpointRow({
          start_at: startAt,
          assignments: [
            {
              trainee_id: null,
              group_id: 'group-1',
              group: {
                members: [
                  { trainee_id: 't1', trainee: { is_active: true } },
                  { trainee_id: 't2', trainee: { is_active: false } },
                ],
              },
            },
          ],
        })
      );
      repo.publishCheckpoint.mockResolvedValue(
        checkpointRow({ status: 'SCHEDULED', start_at: startAt })
      );

      await expect(service.publish(managerId, checkpointId)).resolves.toMatchObject({
        status: 'SCHEDULED',
      });
    });

    it('refuses to publish when every group member is deactivated', async () => {
      repo.findCheckpointDetail.mockResolvedValue(
        checkpointRow({
          start_at: new Date(Date.now() + 60_000),
          assignments: [
            {
              trainee_id: null,
              group_id: 'group-1',
              group: {
                members: [
                  { trainee_id: 't1', trainee: { is_active: false } },
                  { trainee_id: 't2', trainee: { is_active: false } },
                ],
              },
            },
          ],
        })
      );

      await expect(service.publish(managerId, checkpointId)).rejects.toBeInstanceOf(
        ValidationError
      );
      expect(repo.publishCheckpoint).not.toHaveBeenCalled();
    });

    it('refuses to publish a cancelled checkpoint', async () => {
      repo.findCheckpointDetail.mockResolvedValue(checkpointRow({ status: 'CANCELLED' }));

      await expect(service.publish(managerId, checkpointId)).rejects.toMatchObject({
        code: 'CHECKPOINT_NOT_AVAILABLE',
      });
    });
  });

  describe('cancel', () => {
    it('is idempotent for an already cancelled checkpoint', async () => {
      repo.findCheckpointDetail.mockResolvedValue(checkpointRow({ status: 'CANCELLED' }));

      const cancelled = await service.cancel(managerId, checkpointId);

      expect(cancelled.status).toBe('CANCELLED');
      expect(repo.cancelCheckpoint).not.toHaveBeenCalled();
    });

    it('cancels a live checkpoint', async () => {
      repo.findCheckpointDetail.mockResolvedValue(checkpointRow());
      repo.cancelCheckpoint.mockResolvedValue(checkpointRow({ status: 'CANCELLED' }));

      await service.cancel(managerId, checkpointId);

      expect(repo.cancelCheckpoint).toHaveBeenCalledWith(checkpointId, expect.any(Date));
      expect(publishCheckpointActivity).toHaveBeenCalledWith({
        checkpointId,
        reason: 'CANCELLED',
      });
    });
  });

  describe('gradeAttempt', () => {
    it('refuses to grade an attempt that is still running', async () => {
      repo.findAttemptDetail.mockResolvedValue(attemptRow({ status: 'IN_PROGRESS' }));

      await expect(service.gradeAttempt(managerId, attemptId, { marks: [] })).rejects.toMatchObject(
        { code: 'CHECKPOINT_ATTEMPT_FINALIZED' }
      );
    });

    it('rejects a mark above the question maximum', async () => {
      repo.findAttemptDetail.mockResolvedValue(attemptRow());

      await expect(
        service.gradeAttempt(managerId, attemptId, {
          marks: [{ questionId: question.id, awardedMarks: 6 }],
        })
      ).rejects.toBeInstanceOf(ValidationError);
      expect(repo.gradeAttempt).not.toHaveBeenCalled();
    });

    it('rejects a mark for a question outside the checkpoint', async () => {
      repo.findAttemptDetail.mockResolvedValue(attemptRow());

      await expect(
        service.gradeAttempt(managerId, attemptId, {
          marks: [{ questionId: 'other-question', awardedMarks: 1 }],
        })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('stores marks and trims the feedback', async () => {
      repo.findAttemptDetail.mockResolvedValue(attemptRow());
      repo.gradeAttempt.mockResolvedValue(
        attemptRow({ total_score: 5, graded_at: new Date(), feedback: 'Nice' })
      );

      const graded = await service.gradeAttempt(managerId, attemptId, {
        marks: [{ questionId: question.id, awardedMarks: 5 }],
        feedback: '  Nice  ',
      });

      expect(graded.totalScore).toBe(5);
      expect(repo.gradeAttempt).toHaveBeenCalledWith(
        attemptId,
        [{ questionId: question.id, awardedMarks: 5 }],
        'Nice',
        managerId,
        expect.any(Date)
      );
      expect(publishCheckpointActivity).toHaveBeenCalledWith({
        checkpointId,
        reason: 'ATTEMPT_GRADED',
        attemptId,
        traineeId: 'trainee-1',
        traineeName: 'Trainee One',
      });
    });
  });

  describe('files', () => {
    it('throws when the attempt does not exist', async () => {
      repo.findAttempt.mockResolvedValue(null);

      await expect(service.getAnswerFile(attemptId, question.id)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('throws when no file was uploaded', async () => {
      repo.findAttempt.mockResolvedValue({ id: attemptId });
      repo.findAnswerFile.mockResolvedValue({ file_name: null, file_data: null });

      await expect(service.getAnswerFile(attemptId, question.id)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });

  describe('groups', () => {
    it('rejects a group containing a deleted trainee', async () => {
      repo.findTrainees.mockResolvedValue([]);

      await expect(
        service.createGroup(managerId, { name: 'Team A', traineeIds: ['gone'] })
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('maps a duplicate group name to a conflict', async () => {
      repo.createGroup.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.createGroup(managerId, { name: 'Team A', traineeIds: ['t1'] })
      ).rejects.toMatchObject({ code: 'CHECKPOINT_NOT_AVAILABLE' });
    });

    it('creates a group with deduplicated members', async () => {
      repo.createGroup.mockResolvedValue({
        id: 'group-1',
        name: 'Team A',
        created_at: new Date(),
        members: [{ trainee: { id: 't1', name: 'One', email: 'one@example.com' } }],
      });

      const group = await service.createGroup(managerId, {
        name: 'Team A',
        traineeIds: ['t1', 't1'],
      });

      expect(group.members).toHaveLength(1);
      expect(repo.createGroup).toHaveBeenCalledWith(managerId, 'Team A', ['t1']);
    });

    it('reports a missing group on delete', async () => {
      repo.deleteGroup.mockResolvedValue({ count: 0 });

      await expect(service.deleteGroup(managerId, 'missing')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('updates an existing group', async () => {
      repo.findGroup.mockResolvedValue({ id: 'group-1' });
      repo.updateGroup.mockResolvedValue({
        id: 'group-1',
        name: 'Team B',
        created_at: new Date(),
        members: [],
      });

      const group = await service.updateGroup(managerId, 'group-1', {
        name: 'Team B',
        traineeIds: [],
      });

      expect(group.name).toBe('Team B');
      expect(repo.updateGroup).toHaveBeenCalledWith(managerId, 'group-1', 'Team B', []);
    });
  });

  describe('publishResults', () => {
    it('throws for an unknown checkpoint', async () => {
      repo.findCheckpointDetail.mockResolvedValue(null);

      await expect(service.publishResults(managerId, checkpointId)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('stamps the publication time', async () => {
      repo.findCheckpointDetail.mockResolvedValue(checkpointRow());
      repo.publishResults.mockResolvedValue(checkpointRow({ results_published_at: new Date() }));
      repo.listAttemptsForCheckpoint.mockResolvedValue([attemptRow()]);

      const updated = await service.publishResults(managerId, checkpointId);

      expect(updated.resultsPublishedAt).not.toBeNull();
      expect(repo.publishResults).toHaveBeenCalledWith(checkpointId, expect.any(Date));
      expect(publishSpy).toHaveBeenCalledWith(
        'trainee-1',
        expect.objectContaining({ type: 'checkpoint.results.published', checkpointId })
      );
      expect(publishCheckpointActivity).toHaveBeenCalledWith({
        checkpointId,
        reason: 'RESULTS_PUBLISHED',
      });
    });
  });
});
