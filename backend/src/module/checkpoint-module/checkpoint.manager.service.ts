import type {
  CheckpointGroup,
  CheckpointMarkdownPreview,
  ManagerCheckpointAttemptDetail,
  ManagerCheckpointAttemptSummary,
  ManagerCheckpointDetail,
  ManagerCheckpointSummary,
} from '@itp/types';
import { AppError, NotFoundError, ValidationError } from '../../errors/AppError';
import { parseCheckpointMarkdown } from './checkpoint.markdown';
import {
  toManagerAttemptDetail,
  toManagerAttemptSummary,
  toManagerDetail,
  toManagerSummary,
} from './checkpoint.mapper';
import { CheckpointRepository, type CheckpointWriteFields } from './checkpoint.repository';
import type {
  CreateCheckpointBody,
  CreateGroupBody,
  GradeAttemptBody,
  UpdateCheckpointBody,
  UpdateGroupBody,
} from './checkpoint.schema';

const repository = new CheckpointRepository();

const DEFAULT_MAX_ATTEMPTS = 1;

function parsePaper(markdown: string): CheckpointMarkdownPreview {
  const parsed = parseCheckpointMarkdown(markdown);
  if (parsed.questions.length === 0) {
    throw new ValidationError([
      {
        path: ['sourceMarkdown'],
        message:
          'No questions found. Start each question with a Markdown heading such as "## Question 1: My question".',
      },
    ]);
  }
  const missingRuntime = parsed.questions.find(
    (question) => question.type === 'PRACTICAL' && !question.runtime
  );
  if (missingRuntime) {
    throw new ValidationError([
      {
        path: ['sourceMarkdown'],
        message: `Question ${missingRuntime.orderIndex} is practical but has no runtime. Add "Runtime: node", "Runtime: browser" or "Runtime: sql".`,
      },
    ]);
  }
  return parsed;
}

function assertMarksFit(
  parsed: CheckpointMarkdownPreview,
  totalMarks: number,
  passingMarks: number
) {
  if (parsed.totalQuestionMarks > totalMarks) {
    throw new ValidationError([
      {
        path: ['totalMarks'],
        message: `The question paper totals ${parsed.totalQuestionMarks} marks, but total marks is ${totalMarks}.`,
      },
    ]);
  }
  if (passingMarks > totalMarks) {
    throw new ValidationError([
      {
        path: ['passingMarks'],
        message: 'Passing marks cannot be greater than total marks.',
      },
    ]);
  }
}

function normalizeSelection(body: {
  traineeIds?: string[];
  groupIds?: string[];
}): { traineeIds: string[]; groupIds: string[] } | null {
  if (body.traineeIds === undefined && body.groupIds === undefined) return null;
  return {
    traineeIds: [...new Set(body.traineeIds ?? [])],
    groupIds: [...new Set(body.groupIds ?? [])],
  };
}

async function validateSelection(
  managerId: string,
  selection: { traineeIds: string[]; groupIds: string[] }
): Promise<void> {
  const [trainees, groupCount] = await Promise.all([
    repository.findTrainees(selection.traineeIds),
    repository.countGroups(managerId, selection.groupIds),
  ]);

  if (trainees.length !== selection.traineeIds.length) {
    throw new ValidationError([
      { path: ['traineeIds'], message: 'One or more selected trainees no longer exist.' },
    ]);
  }
  if (groupCount !== selection.groupIds.length) {
    throw new ValidationError([
      { path: ['groupIds'], message: 'One or more selected groups no longer exist.' },
    ]);
  }
}

function toGroup(
  row: Awaited<ReturnType<CheckpointRepository['listGroups']>>[number]
): CheckpointGroup {
  return {
    id: row.id,
    name: row.name,
    members: row.members.map((member) => member.trainee),
    createdAt: row.created_at.toISOString(),
  };
}

export class CheckpointManagerService {
  // ---------- Paper preview ----------

  preview = (markdown: string): CheckpointMarkdownPreview => parseCheckpointMarkdown(markdown);

  // ---------- Checkpoints ----------

  list = async (): Promise<ManagerCheckpointSummary[]> => {
    const rows = await repository.listCheckpoints();
    return rows.map(toManagerSummary);
  };

  get = async (checkpointId: string): Promise<ManagerCheckpointDetail> => {
    const row = await repository.findCheckpointDetail(checkpointId);
    if (!row) throw new NotFoundError('Checkpoint not found.');
    return toManagerDetail(row);
  };

  create = async (
    managerId: string,
    body: CreateCheckpointBody
  ): Promise<ManagerCheckpointDetail> => {
    const parsed = parsePaper(body.sourceMarkdown);
    const totalMarks = body.totalMarks;
    const passingMarks = body.passingMarks;
    assertMarksFit(parsed, totalMarks, passingMarks);

    const selection = normalizeSelection(body) ?? { traineeIds: [], groupIds: [] };
    await validateSelection(managerId, selection);

    const fields: CheckpointWriteFields = {
      title: body.title,
      description: body.description,
      source_file_name: body.sourceFileName ?? null,
      source_markdown: body.sourceMarkdown,
      instructions_markdown: parsed.instructionsMarkdown,
      duration_minutes: body.durationMinutes,
      total_marks: totalMarks,
      passing_marks: passingMarks,
      start_at: body.startAt ? new Date(body.startAt) : null,
      max_attempts: body.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      allow_early_submission: body.allowEarlySubmission ?? true,
      allow_late_entry: body.allowLateEntry ?? true,
      result_visibility: body.resultVisibility ?? 'AFTER_APPROVAL',
    };

    const created = await repository.createCheckpoint(
      managerId,
      fields,
      parsed.questions,
      selection
    );
    console.info(`[checkpoint] ${managerId} created draft ${created.id}`);
    return toManagerDetail(created);
  };

  update = async (
    managerId: string,
    checkpointId: string,
    body: UpdateCheckpointBody
  ): Promise<ManagerCheckpointDetail> => {
    const existing = await repository.findCheckpointDetail(checkpointId);
    if (!existing) throw new NotFoundError('Checkpoint not found.');

    if (existing.status === 'CANCELLED') {
      throw new AppError(
        409,
        'CHECKPOINT_NOT_AVAILABLE',
        'A cancelled checkpoint cannot be edited.'
      );
    }
    if ((await repository.countAttempts(checkpointId)) > 0) {
      throw new AppError(
        409,
        'CHECKPOINT_NOT_AVAILABLE',
        'This checkpoint already has trainee attempts, so its content and schedule can no longer be edited.'
      );
    }

    const sourceMarkdown = body.sourceMarkdown ?? existing.source_markdown;
    const parsed = parsePaper(sourceMarkdown);
    const totalMarks = body.totalMarks ?? existing.total_marks;
    const passingMarks = body.passingMarks ?? existing.passing_marks;
    assertMarksFit(parsed, totalMarks, passingMarks);

    const requestedSelection = normalizeSelection(body);
    if (requestedSelection) await validateSelection(managerId, requestedSelection);

    const startAt =
      body.startAt !== undefined
        ? body.startAt
          ? new Date(body.startAt)
          : null
        : existing.start_at;

    const fields: CheckpointWriteFields = {
      title: body.title ?? existing.title,
      description: body.description ?? existing.description,
      source_file_name:
        body.sourceFileName !== undefined ? body.sourceFileName : existing.source_file_name,
      source_markdown: sourceMarkdown,
      instructions_markdown: parsed.instructionsMarkdown,
      duration_minutes: body.durationMinutes ?? existing.duration_minutes,
      total_marks: totalMarks,
      passing_marks: passingMarks,
      start_at: startAt,
      max_attempts: body.maxAttempts ?? existing.max_attempts,
      allow_early_submission: body.allowEarlySubmission ?? existing.allow_early_submission,
      allow_late_entry: body.allowLateEntry ?? existing.allow_late_entry,
      result_visibility: body.resultVisibility ?? existing.result_visibility,
    };

    const updated = await repository.updateCheckpoint(
      checkpointId,
      fields,
      parsed.questions,
      requestedSelection
    );
    console.info(`[checkpoint] ${managerId} updated checkpoint ${checkpointId}`);
    return toManagerDetail(updated);
  };

  publish = async (managerId: string, checkpointId: string): Promise<ManagerCheckpointDetail> => {
    const existing = await repository.findCheckpointDetail(checkpointId);
    if (!existing) throw new NotFoundError('Checkpoint not found.');
    if (existing.status === 'CANCELLED') {
      throw new AppError(
        409,
        'CHECKPOINT_NOT_AVAILABLE',
        'A cancelled checkpoint cannot be published.'
      );
    }
    if (!existing.start_at) {
      throw new ValidationError([
        { path: ['startAt'], message: 'Choose a start date and time before publishing.' },
      ]);
    }

    const assigned = new Set<string>();
    for (const assignment of existing.assignments) {
      if (assignment.trainee_id) assigned.add(assignment.trainee_id);
      for (const member of assignment.group?.members ?? []) assigned.add(member.trainee_id);
    }
    if (assigned.size === 0) {
      throw new ValidationError([
        {
          path: ['traineeIds'],
          message: 'Assign at least one trainee or group before publishing.',
        },
      ]);
    }

    const published = await repository.publishCheckpoint(checkpointId, existing.start_at);
    console.info(`[checkpoint] ${managerId} scheduled checkpoint ${checkpointId}`);
    return toManagerDetail(published);
  };

  cancel = async (managerId: string, checkpointId: string): Promise<ManagerCheckpointDetail> => {
    const existing = await repository.findCheckpointDetail(checkpointId);
    if (!existing) throw new NotFoundError('Checkpoint not found.');
    if (existing.status === 'CANCELLED') return toManagerDetail(existing);

    const cancelled = await repository.cancelCheckpoint(checkpointId, new Date());
    console.info(`[checkpoint] ${managerId} cancelled checkpoint ${checkpointId}`);
    return toManagerDetail(cancelled);
  };

  publishResults = async (
    managerId: string,
    checkpointId: string
  ): Promise<ManagerCheckpointDetail> => {
    const existing = await repository.findCheckpointDetail(checkpointId);
    if (!existing) throw new NotFoundError('Checkpoint not found.');
    const updated = await repository.publishResults(checkpointId, new Date());
    console.info(`[checkpoint] ${managerId} published results for checkpoint ${checkpointId}`);
    return toManagerDetail(updated);
  };

  // ---------- Attempts and grading ----------

  listAttempts = async (checkpointId: string): Promise<ManagerCheckpointAttemptSummary[]> => {
    const checkpoint = await repository.findCheckpointSummary(checkpointId);
    if (!checkpoint) throw new NotFoundError('Checkpoint not found.');
    const rows = await repository.listAttemptsForCheckpoint(checkpointId);
    return rows.map((row) => toManagerAttemptSummary(row, checkpoint));
  };

  getAttempt = async (attemptId: string): Promise<ManagerCheckpointAttemptDetail> => {
    const row = await repository.findAttemptDetail(attemptId);
    if (!row) throw new NotFoundError('Attempt not found.');
    return toManagerAttemptDetail(row);
  };

  gradeAttempt = async (
    managerId: string,
    attemptId: string,
    body: GradeAttemptBody
  ): Promise<ManagerCheckpointAttemptDetail> => {
    const detail = await repository.findAttemptDetail(attemptId);
    if (!detail) throw new NotFoundError('Attempt not found.');
    if (detail.status !== 'SUBMITTED') {
      throw new AppError(
        409,
        'CHECKPOINT_ATTEMPT_FINALIZED',
        'Wait for the attempt to be submitted before grading it.'
      );
    }

    const questionMarks = new Map(detail.checkpoint.questions.map((q) => [q.id, q.marks]));
    for (const mark of body.marks) {
      const max = questionMarks.get(mark.questionId);
      if (max === undefined) {
        throw new ValidationError([
          { path: ['marks'], message: 'A mark was sent for a question outside this checkpoint.' },
        ]);
      }
      if (mark.awardedMarks > max) {
        throw new ValidationError([
          {
            path: ['marks'],
            message: `A question cannot be awarded more than its ${max} marks.`,
          },
        ]);
      }
    }

    const updated = await repository.gradeAttempt(
      attemptId,
      body.marks,
      body.feedback?.trim() || null,
      managerId,
      new Date()
    );
    console.info(`[checkpoint] ${managerId} graded attempt ${attemptId}`);
    return toManagerAttemptDetail(updated);
  };

  getAnswerFile = async (attemptId: string, questionId: string) => {
    const attempt = await repository.findAttempt(attemptId);
    if (!attempt) throw new NotFoundError('Attempt not found.');
    const file = await repository.findAnswerFile(attemptId, questionId);
    if (!file?.file_data || !file.file_name) throw new NotFoundError('No file was uploaded.');
    return file;
  };

  // ---------- Groups ----------

  listGroups = async (managerId: string): Promise<CheckpointGroup[]> => {
    const rows = await repository.listGroups(managerId);
    return rows.map(toGroup);
  };

  createGroup = async (managerId: string, body: CreateGroupBody): Promise<CheckpointGroup> => {
    const traineeIds = [...new Set(body.traineeIds)];
    const trainees = await repository.findTrainees(traineeIds);
    if (trainees.length !== traineeIds.length) {
      throw new ValidationError([
        { path: ['traineeIds'], message: 'One or more selected trainees no longer exist.' },
      ]);
    }
    try {
      return toGroup(await repository.createGroup(managerId, body.name, traineeIds));
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: unknown }).code === 'P2002'
      ) {
        throw new AppError(
          409,
          'CHECKPOINT_NOT_AVAILABLE',
          'A group with that name already exists.'
        );
      }
      throw error;
    }
  };

  updateGroup = async (
    managerId: string,
    groupId: string,
    body: UpdateGroupBody
  ): Promise<CheckpointGroup> => {
    const existing = await repository.findGroup(managerId, groupId);
    if (!existing) throw new NotFoundError('Group not found.');
    const traineeIds = [...new Set(body.traineeIds)];
    const trainees = await repository.findTrainees(traineeIds);
    if (trainees.length !== traineeIds.length) {
      throw new ValidationError([
        { path: ['traineeIds'], message: 'One or more selected trainees no longer exist.' },
      ]);
    }
    return toGroup(await repository.updateGroup(managerId, groupId, body.name, traineeIds));
  };

  deleteGroup = async (managerId: string, groupId: string): Promise<void> => {
    const deleted = await repository.deleteGroup(managerId, groupId);
    if (deleted.count === 0) throw new NotFoundError('Group not found.');
  };
}
