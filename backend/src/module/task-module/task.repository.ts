import type { TaskFile } from '@itp/types';
import { type task_progress, Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';

export class TaskRepository {
  /** A task with what the task page shows about its day, or null. */
  findTask = (taskId: string) => {
    return prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        instructions_markdown: true,
        is_stretch_goal: true,
        sequence_order: true,
        estimated_minutes: true,
        runtime: true,
        run_command: true,
        setup_sql: true,
        curriculum_day: {
          select: {
            id: true,
            day_number: true,
            course: {
              select: { title: true },
            },
          },
        },
      },
    });
  };

  findStarterFiles = (taskId: string) => {
    return prisma.task.findUnique({
      where: { id: taskId },
      select: { starter_files: true },
    });
  };

  /** This trainee's progress row for the task, or null if they haven't saved or submitted it. */
  findProgress = (traineeId: string, taskId: string) => {
    return prisma.task_progress.findUnique({
      where: {
        trainee_id_task_id: {
          trainee_id: traineeId,
          task_id: taskId,
        },
      },
    });
  };

  /** The same existence check without loading the saved files (called on every autosave). */
  findProgressStatus = (traineeId: string, taskId: string) => {
    return prisma.task_progress.findUnique({
      where: {
        trainee_id_task_id: {
          trainee_id: traineeId,
          task_id: taskId,
        },
      },
      select: { status: true },
    });
  };

  /**
   * Who to notify about a submit/resubmit, plus the names the notification shows.
   * `mentorId` is null when nobody is assigned to the trainee yet.
   */
  findSubmissionContext = async (
    traineeId: string,
    taskId: string
  ): Promise<{
    mentorId: string | null;
    mentorSlackChannelId: string | null;
    traineeName: string;
    taskTitle: string;
    courseTitle: string;
    dayNumber: number | null;
  }> => {
    const [trainee, task] = await Promise.all([
      prisma.trainee.findUnique({
        where: { id: traineeId },
        select: {
          name: true,
          mentor_id: true,
          mentor: { select: { slack_channel_id: true } },
        },
      }),
      prisma.task.findUnique({
        where: { id: taskId },
        select: {
          title: true,
          curriculum_day: {
            select: {
              day_number: true,
              course: { select: { title: true } },
            },
          },
        },
      }),
    ]);

    return {
      mentorId: trainee?.mentor_id ?? null,
      mentorSlackChannelId: trainee?.mentor?.slack_channel_id ?? null,
      traineeName: trainee?.name ?? '',
      taskTitle: task?.title ?? '',
      courseTitle: task?.curriculum_day?.course?.title ?? '',
      dayNumber: task?.curriculum_day?.day_number ?? null,
    };
  };

  /**
   * Stores the whole working file set.
   *
   * A new row starts as in_progress; an existing row keeps its status.
   *
   * IMPORTANT:
   * Only updates `files`.
   * Never modifies `submitted_files` or submission metadata.
   */
  saveFiles = (traineeId: string, taskId: string, files: TaskFile[], savedAt: Date) => {
    return prisma.task_progress.upsert({
      where: {
        trainee_id_task_id: {
          trainee_id: traineeId,
          task_id: taskId,
        },
      },
      create: {
        trainee_id: traineeId,
        task_id: taskId,
        status: 'in_progress',
        files,
        code_updated_at: savedAt,
      },
      update: {
        files,
        code_updated_at: savedAt,
      },
    });
  };

  /**
   * Adds `deltaSeconds` to the trainee's accumulated time on the task.
   *
   * Uses a create-if-missing/otherwise-increment pattern so the very first
   * heartbeat (which arrives before any file save) creates the progress row
   * and lets the mentor see "started" at the same moment the client does.
   *
   * `deltaSeconds` is capped server-side so a stalled/sleeping client or a
   * tampered payload cannot inject unbounded time.
   *
   * `onCreated` runs only when the row was first created, so the service can
   * publish `task.started` without duplicating `saveCode`'s notification.
   */
  recordTimeHeartbeat = async (
    traineeId: string,
    taskId: string,
    deltaSeconds: number,
    now: Date,
    onCreated?: (progress: task_progress) => Promise<void>
  ): Promise<{ created: boolean; timeSpentSeconds: number }> => {
    const MAX_DELTA_SECONDS = 300;
    const safeDelta = Math.max(0, Math.min(Math.floor(deltaSeconds), MAX_DELTA_SECONDS));

    try {
      const created = await prisma.task_progress.create({
        data: {
          trainee_id: traineeId,
          task_id: taskId,
          status: 'in_progress',
          time_spent_seconds: safeDelta,
          last_heartbeat_at: now,
        },
      });
      if (onCreated) await onCreated(created);
      return { created: true, timeSpentSeconds: created.time_spent_seconds };
    } catch (error) {
      // P2002 = unique constraint on (trainee_id, task_id) — a save or another
      // heartbeat created the row first. Fall through to the increment path.
      const code = (error as { code?: string } | null)?.code;
      if (code !== 'P2002') throw error;
    }

    const updated = await prisma.task_progress.update({
      where: {
        trainee_id_task_id: { trainee_id: traineeId, task_id: taskId },
      },
      data: {
        time_spent_seconds: { increment: safeDelta },
        last_heartbeat_at: now,
      },
      select: { time_spent_seconds: true },
    });

    return { created: false, timeSpentSeconds: updated.time_spent_seconds };
  };

  /**
   * Marks the task completed as a new submission attempt.
   *
   * Creates an immutable-in-practice snapshot of the current working files
   * in `submitted_files`.
   *
   * Every submission:
   * - Copies files into submitted_files.
   * - Increments submission_count.
   * - Updates last_submitted_at.
   * - Sets review_status back to pending.
   *
   * If the trainee has never saved files, task starter files are submitted.
   *
   * Returns null when the task is already approved.
   */
  markSubmitted = async (
    traineeId: string,
    taskId: string,
    submittedAt: Date,
    onSubmitted?: (tx: Prisma.TransactionClient, progress: task_progress) => Promise<void>
  ): Promise<task_progress | null> => {
    const key = {
      trainee_id: traineeId,
      task_id: taskId,
    };

    return prisma.$transaction(async (tx) => {
      // Fetch the existing progress, including the working files.
      const existing = await tx.task_progress.findUnique({
        where: {
          trainee_id_task_id: key,
        },
        select: {
          id: true,
          files: true,
          review_status: true,
          first_submitted_at: true,
        },
      });

      // An approved task cannot be resubmitted.
      if (existing?.review_status === 'approved') {
        return null;
      }

      // Use the saved working copy.
      // If no files have ever been saved, submit the starter files.
      const submittedFiles = existing
        ? (existing.files ??
          (
            await tx.task.findUniqueOrThrow({
              where: { id: taskId },
              select: { starter_files: true },
            })
          ).starter_files)
        : (
            await tx.task.findUniqueOrThrow({
              where: { id: taskId },
              select: { starter_files: true },
            })
          ).starter_files;

      // First submission: create the progress row and its snapshot.
      if (!existing) {
        const created = await tx.task_progress.create({
          data: {
            trainee_id: traineeId,
            task_id: taskId,
            status: 'completed',
            review_status: 'pending',
            submission_count: 1,
            files: Prisma.DbNull,
            submitted_files: submittedFiles ?? Prisma.DbNull,
            first_submitted_at: submittedAt,
            last_submitted_at: submittedAt,
          },
        });
        if (onSubmitted) await onSubmitted(tx, created);
        return created;
      }

      // Conditional update protects against an approval happening
      // between the initial read and this write.
      const updated = await tx.task_progress.updateMany({
        where: {
          id: existing.id,
          OR: [{ review_status: null }, { review_status: 'pending' }, { review_status: 'rework' }],
        },
        data: {
          status: 'completed',
          submitted_files: submittedFiles ?? Prisma.DbNull,
          last_submitted_at: submittedAt,
          first_submitted_at: existing.first_submitted_at ?? submittedAt,
          review_status: 'pending',
          submission_count: {
            increment: 1,
          },
        },
      });

      if (updated.count === 0) {
        return null;
      }

      const progress = await tx.task_progress.findUniqueOrThrow({
        where: { id: existing.id },
      });
      if (onSubmitted) await onSubmitted(tx, progress);
      return progress;
    });
  };
}
