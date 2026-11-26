import { randomBytes } from 'node:crypto';
import type {
  CheckpointAssignmentSelection,
  CheckpointResultVisibility,
  CheckpointStatus,
  CheckpointSubmissionReason,
  CheckpointWorkspaceFile,
  ParsedCheckpointQuestion,
} from '@itp/types';
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';

const assignmentInclude = {
  select: {
    trainee_id: true,
    group_id: true,
    group: {
      select: {
        members: {
          select: { trainee_id: true, trainee: { select: { is_active: true } } },
        },
      },
    },
  },
} as const;

const summaryInclude = {
  assignments: assignmentInclude,
  attempts: { select: { status: true, graded_at: true } },
  _count: { select: { attempts: true } },
} as const;

const detailInclude = {
  ...summaryInclude,
  questions: { orderBy: { order_index: 'asc' as const } },
} as const;

const attemptTraineeInclude = {
  trainee: { select: { name: true, email: true } },
  graded_by: { select: { name: true } },
} as const;

const attemptDetailInclude = {
  ...attemptTraineeInclude,
  checkpoint: {
    select: {
      id: true,
      title: true,
      total_marks: true,
      passing_marks: true,
      result_visibility: true,
      results_published_at: true,
      questions: { orderBy: { order_index: 'asc' as const } },
    },
  },
  answers: true,
  events: { orderBy: { created_at: 'asc' as const } },
} as const;

export type CheckpointSummaryRow = Prisma.checkpointGetPayload<{ include: typeof summaryInclude }>;
export type CheckpointDetailRow = Prisma.checkpointGetPayload<{ include: typeof detailInclude }>;
export type AttemptSummaryRow = Prisma.checkpoint_attemptGetPayload<{
  include: typeof attemptTraineeInclude;
}>;
export type AttemptDetailRow = Prisma.checkpoint_attemptGetPayload<{
  include: typeof attemptDetailInclude;
}>;

export type CheckpointWriteFields = {
  title: string;
  description: string;
  mode: 'MCQ' | 'PRACTICAL';
  source_file_name: string | null;
  source_markdown: string;
  instructions_markdown: string;
  duration_minutes: number;
  total_marks: number;
  passing_marks: number;
  start_at: Date | null;
  max_attempts: number;
  allow_early_submission: boolean;
  allow_late_entry: boolean;
  result_visibility: CheckpointResultVisibility;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

async function writeQuestions(
  tx: Prisma.TransactionClient,
  checkpointId: string,
  questions: ParsedCheckpointQuestion[]
): Promise<void> {
  await tx.checkpoint_question.deleteMany({ where: { checkpoint_id: checkpointId } });
  await tx.checkpoint_question.createMany({
    data: questions.map((question) => ({
      checkpoint_id: checkpointId,
      order_index: question.orderIndex,
      title: question.title,
      prompt_markdown: question.promptMarkdown,
      type: question.type,
      marks: question.marks,
      options: question.options ?? undefined,
      correct_option: question.correctOption,
      code_language: question.codeLanguage,
      runtime: question.runtime,
      run_command: question.runCommand,
      setup_sql: question.setupSql,
      starter_files: question.starterFiles ?? undefined,
    })),
  });
}

async function writeAssignments(
  tx: Prisma.TransactionClient,
  checkpointId: string,
  selection: CheckpointAssignmentSelection
): Promise<void> {
  await tx.checkpoint_assignment.deleteMany({ where: { checkpoint_id: checkpointId } });
  const rows: Array<{ checkpoint_id: string; trainee_id?: string; group_id?: string }> = [];
  for (const traineeId of [...new Set(selection.traineeIds)]) {
    rows.push({ checkpoint_id: checkpointId, trainee_id: traineeId });
  }
  for (const groupId of [...new Set(selection.groupIds)]) {
    rows.push({ checkpoint_id: checkpointId, group_id: groupId });
  }
  if (rows.length > 0) await tx.checkpoint_assignment.createMany({ data: rows });
}

export class CheckpointRepository {
  // ---------- Manager: checkpoints ----------

  listCheckpoints = () =>
    prisma.checkpoint.findMany({
      orderBy: [{ created_at: 'desc' }],
      include: summaryInclude,
    }) as Promise<CheckpointSummaryRow[]>;

  findCheckpointDetail = (checkpointId: string) =>
    prisma.checkpoint.findUnique({
      where: { id: checkpointId },
      include: detailInclude,
    }) as Promise<CheckpointDetailRow | null>;

  findCheckpointSummary = (checkpointId: string) =>
    prisma.checkpoint.findUnique({
      where: { id: checkpointId },
      include: summaryInclude,
    }) as Promise<CheckpointSummaryRow | null>;

  createCheckpoint = (
    managerId: string,
    fields: CheckpointWriteFields,
    questions: ParsedCheckpointQuestion[],
    selection: CheckpointAssignmentSelection
  ) =>
    prisma.$transaction(async (tx) => {
      const created = await tx.checkpoint.create({
        data: {
          ...fields,
          created_by_id: managerId,
          status: 'DRAFT',
        },
      });
      await writeQuestions(tx, created.id, questions);
      await writeAssignments(tx, created.id, selection);
      return tx.checkpoint.findUniqueOrThrow({
        where: { id: created.id },
        include: detailInclude,
      });
    }) as Promise<CheckpointDetailRow>;

  updateCheckpoint = (
    checkpointId: string,
    fields: CheckpointWriteFields,
    questions: ParsedCheckpointQuestion[] | null,
    selection: CheckpointAssignmentSelection | null
  ) =>
    prisma.$transaction(async (tx) => {
      await tx.checkpoint.update({ where: { id: checkpointId }, data: fields });
      if (questions) await writeQuestions(tx, checkpointId, questions);
      if (selection) await writeAssignments(tx, checkpointId, selection);
      return tx.checkpoint.findUniqueOrThrow({
        where: { id: checkpointId },
        include: detailInclude,
      });
    }) as Promise<CheckpointDetailRow>;

  countAttempts = (checkpointId: string) =>
    prisma.checkpoint_attempt.count({ where: { checkpoint_id: checkpointId } });

  publishCheckpoint = (checkpointId: string, startAt: Date) =>
    prisma.checkpoint.update({
      where: { id: checkpointId },
      data: { status: 'SCHEDULED', start_at: startAt },
      include: detailInclude,
    }) as Promise<CheckpointDetailRow>;

  publishResults = (checkpointId: string, now: Date) =>
    prisma.checkpoint.update({
      where: { id: checkpointId },
      data: { results_published_at: now },
      include: detailInclude,
    }) as Promise<CheckpointDetailRow>;

  /** Cancels the checkpoint and finalises any attempt still running. */
  cancelCheckpoint = (checkpointId: string, now: Date) =>
    prisma.$transaction(async (tx) => {
      const updated = await tx.checkpoint.update({
        where: { id: checkpointId },
        data: { status: 'CANCELLED' },
        include: detailInclude,
      });

      const running = await tx.checkpoint_attempt.findMany({
        where: { checkpoint_id: checkpointId, status: 'IN_PROGRESS' },
        select: { id: true },
      });
      if (running.length > 0) {
        await tx.checkpoint_attempt.updateMany({
          where: { id: { in: running.map((attempt) => attempt.id) } },
          data: {
            status: 'SUBMITTED',
            submitted_at: now,
            submission_reason: 'CANCELLED',
          },
        });
        await tx.checkpoint_attempt_event.createMany({
          data: running.map((attempt) => ({
            attempt_id: attempt.id,
            type: 'CANCELLED',
            message: 'The manager cancelled this checkpoint.',
          })),
        });
      }

      return updated;
    }) as Promise<CheckpointDetailRow>;

  // ---------- Manager: groups ----------

  listGroups = (managerId: string) =>
    prisma.trainee_group.findMany({
      where: { created_by_id: managerId },
      orderBy: { name: 'asc' },
      include: {
        members: {
          orderBy: { trainee: { name: 'asc' } },
          select: { trainee: { select: { id: true, name: true, email: true, is_active: true } } },
        },
      },
    });

  createGroup = (managerId: string, name: string, traineeIds: string[]) =>
    prisma.trainee_group.create({
      data: {
        name,
        created_by_id: managerId,
        members: {
          create: [...new Set(traineeIds)].map((traineeId) => ({ trainee_id: traineeId })),
        },
      },
      include: {
        members: {
          orderBy: { trainee: { name: 'asc' } },
          select: { trainee: { select: { id: true, name: true, email: true, is_active: true } } },
        },
      },
    });

  findGroup = (managerId: string, groupId: string) =>
    prisma.trainee_group.findFirst({
      where: { id: groupId, created_by_id: managerId },
      include: {
        members: {
          orderBy: { trainee: { name: 'asc' } },
          select: { trainee: { select: { id: true, name: true, email: true, is_active: true } } },
        },
      },
    });

  updateGroup = (managerId: string, groupId: string, name: string, traineeIds: string[]) =>
    prisma.$transaction(async (tx) => {
      await tx.trainee_group.update({
        where: { id: groupId },
        data: { name },
      });
      await tx.trainee_group_member.deleteMany({ where: { group_id: groupId } });
      if (traineeIds.length > 0) {
        await tx.trainee_group_member.createMany({
          data: [...new Set(traineeIds)].map((traineeId) => ({
            group_id: groupId,
            trainee_id: traineeId,
          })),
        });
      }
      return tx.trainee_group.findUniqueOrThrow({
        where: { id: groupId },
        include: {
          members: {
            orderBy: { trainee: { name: 'asc' } },
            select: { trainee: { select: { id: true, name: true, email: true, is_active: true } } },
          },
        },
      });
    });

  deleteGroup = (managerId: string, groupId: string) =>
    prisma.trainee_group.deleteMany({ where: { id: groupId, created_by_id: managerId } });

  findTrainees = (traineeIds: string[]) =>
    prisma.trainee.findMany({
      where: { id: { in: [...new Set(traineeIds)] } },
      select: { id: true },
    });

  countGroups = (managerId: string, groupIds: string[]) =>
    prisma.trainee_group.count({
      where: { id: { in: [...new Set(groupIds)] }, created_by_id: managerId },
    });

  // ---------- Trainee access ----------

  listTraineeCheckpoints = (traineeId: string) =>
    prisma.checkpoint.findMany({
      where: {
        status: 'SCHEDULED',
        OR: [
          { assignments: { some: { trainee_id: traineeId } } },
          {
            assignments: {
              some: { group: { members: { some: { trainee_id: traineeId } } } },
            },
          },
        ],
      },
      orderBy: [{ start_at: 'asc' }],
      include: {
        attempts: {
          where: { trainee_id: traineeId },
          orderBy: { attempt_number: 'desc' },
          include: { trainee: { select: { name: true, email: true } }, graded_by: true },
        },
      },
    });

  findTraineeCheckpoint = (traineeId: string, checkpointId: string) =>
    prisma.checkpoint.findFirst({
      where: {
        id: checkpointId,
        status: 'SCHEDULED',
        OR: [
          { assignments: { some: { trainee_id: traineeId } } },
          {
            assignments: {
              some: { group: { members: { some: { trainee_id: traineeId } } } },
            },
          },
        ],
      },
      include: {
        questions: { orderBy: { order_index: 'asc' } },
        attempts: {
          where: { trainee_id: traineeId },
          orderBy: { attempt_number: 'desc' },
        },
      },
    });

  isAssigned = async (traineeId: string, checkpointId: string): Promise<boolean> => {
    const count = await prisma.checkpoint_assignment.count({
      where: {
        checkpoint_id: checkpointId,
        OR: [
          { trainee_id: traineeId },
          { group: { members: { some: { trainee_id: traineeId } } } },
        ],
      },
    });
    return count > 0;
  };

  findActiveAttempt = (traineeId: string) =>
    prisma.checkpoint_attempt.findFirst({
      where: { trainee_id: traineeId, status: 'IN_PROGRESS' },
      include: attemptTraineeInclude,
    }) as Promise<AttemptSummaryRow | null>;

  findActiveAttemptWithCheckpoint = (traineeId: string) =>
    prisma.checkpoint_attempt.findFirst({
      where: { trainee_id: traineeId, status: 'IN_PROGRESS' },
      include: {
        checkpoint: { select: { id: true, title: true, duration_minutes: true } },
      },
    });

  /** Latest attempt for the trainee on this checkpoint (any status). */
  findLatestTraineeAttempt = (checkpointId: string, traineeId: string) =>
    prisma.checkpoint_attempt.findFirst({
      where: { checkpoint_id: checkpointId, trainee_id: traineeId },
      orderBy: { attempt_number: 'desc' },
    });

  startAttempt = (
    checkpointId: string,
    traineeId: string,
    startedAt: Date,
    deadlineAt: Date,
    attemptNumber: number,
    questions: Array<{ id: string }>
  ) =>
    prisma.$transaction(async (tx) => {
      const attempt = await tx.checkpoint_attempt.create({
        data: {
          checkpoint_id: checkpointId,
          trainee_id: traineeId,
          attempt_number: attemptNumber,
          session_token: randomBytes(24).toString('base64url'),
          started_at: startedAt,
          deadline_at: deadlineAt,
          last_seen_at: startedAt,
        },
      });

      if (questions.length > 0) {
        await tx.checkpoint_answer.createMany({
          data: questions.map((question) => ({
            attempt_id: attempt.id,
            question_id: question.id,
            client_revision: 0,
            saved_at: startedAt,
          })),
        });
      }

      await tx.checkpoint_attempt_event.create({
        data: {
          attempt_id: attempt.id,
          type: 'STARTED',
          message: `Attempt ${attemptNumber} started.`,
        },
      });

      return tx.checkpoint_attempt.findUniqueOrThrow({
        where: { id: attempt.id },
        include: {
          answers: true,
          checkpoint: {
            select: {
              id: true,
              title: true,
              instructions_markdown: true,
              total_marks: true,
              passing_marks: true,
              allow_early_submission: true,
              result_visibility: true,
              results_published_at: true,
              questions: { orderBy: { order_index: 'asc' } },
            },
          },
        },
      });
    });

  findAttempt = (attemptId: string) =>
    prisma.checkpoint_attempt.findUnique({ where: { id: attemptId } });

  findAttemptWithCheckpoint = (attemptId: string) =>
    prisma.checkpoint_attempt.findUnique({
      where: { id: attemptId },
      include: {
        checkpoint: {
          select: {
            id: true,
            title: true,
            instructions_markdown: true,
            total_marks: true,
            passing_marks: true,
            allow_early_submission: true,
            result_visibility: true,
            results_published_at: true,
            questions: { orderBy: { order_index: 'asc' } },
          },
        },
        answers: true,
      },
    });

  touchAttempt = (attemptId: string, now: Date) =>
    prisma.checkpoint_attempt.updateMany({
      where: { id: attemptId, status: 'IN_PROGRESS' },
      data: { last_seen_at: now },
    });

  /**
   * Compare-and-set write: an answer is only replaced when the incoming client
   * revision is newer than the stored one. A delayed request therefore can never
   * overwrite a newer answer, and the response says whether the write was stale.
   */
  saveAnswer = async (input: {
    attemptId: string;
    questionId: string;
    clientRevision: number;
    fields: {
      answer_text?: string | null;
      selected_option?: string | null;
      file_name?: string | null;
      file_mime_type?: string | null;
      file_size?: number | null;
      file_data?: string | null;
      workspace_files?: CheckpointWorkspaceFile[] | null;
    };
    now: Date;
  }): Promise<{ clientRevision: number; savedAt: Date; stale: boolean }> => {
    const { workspace_files, ...scalarFields } = input.fields;
    const jsonFields =
      workspace_files === undefined
        ? {}
        : {
            workspace_files:
              workspace_files === null
                ? Prisma.DbNull
                : (workspace_files as unknown as Prisma.InputJsonValue),
          };

    const updated = await prisma.checkpoint_answer.updateMany({
      where: {
        attempt_id: input.attemptId,
        question_id: input.questionId,
        client_revision: { lt: input.clientRevision },
      },
      data: {
        ...scalarFields,
        ...jsonFields,
        client_revision: input.clientRevision,
        saved_at: input.now,
      },
    });

    if (updated.count > 0) {
      return { clientRevision: input.clientRevision, savedAt: input.now, stale: false };
    }

    const current = await prisma.checkpoint_answer.findUnique({
      where: {
        attempt_id_question_id: {
          attempt_id: input.attemptId,
          question_id: input.questionId,
        },
      },
    });

    if (current) {
      return {
        clientRevision: current.client_revision,
        savedAt: current.saved_at,
        stale: current.client_revision >= input.clientRevision,
      };
    }

    // Defensive: attempts created before answers were pre-seeded.
    try {
      const created = await prisma.checkpoint_answer.create({
        data: {
          attempt_id: input.attemptId,
          question_id: input.questionId,
          ...scalarFields,
          ...jsonFields,
          client_revision: input.clientRevision,
          saved_at: input.now,
        },
      });
      return { clientRevision: created.client_revision, savedAt: created.saved_at, stale: false };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await prisma.checkpoint_answer.findUniqueOrThrow({
        where: {
          attempt_id_question_id: {
            attempt_id: input.attemptId,
            question_id: input.questionId,
          },
        },
      });
      return {
        clientRevision: raced.client_revision,
        savedAt: raced.saved_at,
        stale: true,
      };
    }
  };

  /** Idempotently finalise one attempt. Returns the current row, never a second finalise. */
  finalizeAttempt = async (
    attemptId: string,
    reason: CheckpointSubmissionReason,
    now: Date
  ): Promise<AttemptSummaryRow | null> => {
    const attempt = await prisma.checkpoint_attempt.findUnique({
      where: { id: attemptId },
      select: { id: true, status: true, deadline_at: true },
    });
    if (!attempt) return null;
    if (attempt.status === 'SUBMITTED') {
      return prisma.checkpoint_attempt.findUnique({
        where: { id: attemptId },
        include: attemptTraineeInclude,
      });
    }

    const submittedAt =
      reason === 'TIME_EXPIRED'
        ? new Date(Math.min(now.getTime(), attempt.deadline_at.getTime()))
        : now;

    const updated = await prisma.checkpoint_attempt.updateMany({
      where: { id: attemptId, status: 'IN_PROGRESS' },
      data: {
        status: 'SUBMITTED',
        submitted_at: submittedAt,
        submission_reason: reason,
      },
    });

    if (updated.count > 0) {
      await prisma.checkpoint_attempt_event.create({
        data: {
          attempt_id: attemptId,
          type: reason === 'TIME_EXPIRED' ? 'TIME_EXPIRED' : reason,
          message:
            reason === 'TIME_EXPIRED'
              ? 'Time expired. The attempt was submitted automatically.'
              : reason === 'MANUAL'
                ? 'Submitted by the trainee.'
                : 'Finalised because the checkpoint was cancelled.',
        },
      });
    }

    return prisma.checkpoint_attempt.findUnique({
      where: { id: attemptId },
      include: attemptTraineeInclude,
    });
  };

  listExpiredAttemptIds = (now: Date, limit = 100) =>
    prisma.checkpoint_attempt.findMany({
      where: { status: 'IN_PROGRESS', deadline_at: { lte: now } },
      orderBy: { deadline_at: 'asc' },
      take: limit,
      select: { id: true },
    });

  // ---------- Manager: attempts, grading ----------

  listAttemptsForCheckpoint = (checkpointId: string) =>
    prisma.checkpoint_attempt.findMany({
      where: { checkpoint_id: checkpointId },
      orderBy: [{ submitted_at: 'desc' }, { started_at: 'desc' }],
      include: attemptTraineeInclude,
    }) as Promise<AttemptSummaryRow[]>;

  findAttemptDetail = (attemptId: string) =>
    prisma.checkpoint_attempt.findUnique({
      where: { id: attemptId },
      include: attemptDetailInclude,
    }) as Promise<AttemptDetailRow | null>;

  gradeAttempt = (
    attemptId: string,
    grades: Array<{ questionId: string; awardedMarks: number }>,
    feedback: string | null,
    managerId: string,
    now: Date
  ) =>
    prisma.$transaction(async (tx) => {
      const attempt = await tx.checkpoint_attempt.findUniqueOrThrow({
        where: { id: attemptId },
        include: {
          answers: true,
          checkpoint: { select: { total_marks: true, questions: true } },
        },
      });

      const gradesByQuestion = new Map(
        grades.map((grade) => [grade.questionId, grade.awardedMarks])
      );
      let total = 0;

      for (const answer of attempt.answers) {
        const awarded = gradesByQuestion.get(answer.question_id);
        if (awarded === undefined) {
          total += answer.awarded_marks ?? 0;
          continue;
        }
        await tx.checkpoint_answer.update({
          where: { id: answer.id },
          data: { awarded_marks: awarded },
        });
        total += awarded;
      }

      await tx.checkpoint_attempt.update({
        where: { id: attemptId },
        data: {
          total_score: total,
          feedback,
          graded_by_id: managerId,
          graded_at: now,
        },
      });

      await tx.checkpoint_attempt_event.create({
        data: {
          attempt_id: attemptId,
          type: 'GRADED',
          message: `Graded ${total} of ${attempt.checkpoint.total_marks} marks.`,
        },
      });

      return tx.checkpoint_attempt.findUniqueOrThrow({
        where: { id: attemptId },
        include: attemptDetailInclude,
      });
    }) as Promise<AttemptDetailRow>;

  findAnswerFile = (attemptId: string, questionId: string) =>
    prisma.checkpoint_answer.findUnique({
      where: {
        attempt_id_question_id: { attempt_id: attemptId, question_id: questionId },
      },
      select: {
        file_name: true,
        file_mime_type: true,
        file_size: true,
        file_data: true,
      },
    });

  // ---------- Trainee: results ----------

  findVisibleResult = (attemptId: string, traineeId: string) =>
    prisma.checkpoint_attempt.findFirst({
      where: { id: attemptId, trainee_id: traineeId },
      include: attemptDetailInclude,
    }) as Promise<AttemptDetailRow | null>;
}

export type CheckpointStatusValue = CheckpointStatus;
