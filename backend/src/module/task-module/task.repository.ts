import type { TaskFile } from '@itp/types';
import type { task_progress } from '../../generated/prisma/client';
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
          select: { id: true, day_number: true, course: { select: { title: true } } },
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
      where: { trainee_id_task_id: { trainee_id: traineeId, task_id: taskId } },
    });
  };

  /**
   * Stores the whole file set. A new row starts as in_progress; an existing row keeps its status,
   * so a completed task stays completed when it is edited again.
   */
  saveFiles = (traineeId: string, taskId: string, files: TaskFile[], savedAt: Date) => {
    return prisma.task_progress.upsert({
      where: { trainee_id_task_id: { trainee_id: traineeId, task_id: taskId } },
      create: {
        trainee_id: traineeId,
        task_id: taskId,
        status: 'in_progress',
        files,
        code_updated_at: savedAt,
      },
      update: { files, code_updated_at: savedAt },
    });
  };

  /**
   * Marks the task completed as a new submission attempt: review_status goes back to
   * pending and submission_count is incremented, so the new attempt awaits review.
   *
   * first_submitted_at is set only on create, so two submits at once can't overwrite
   * each other's first time. Returns null when the task is already approved: an
   * approved task cannot be resubmitted (checked inside the transaction).
   */
  markSubmitted = async (
    traineeId: string,
    taskId: string,
    submittedAt: Date
  ): Promise<task_progress | null> => {
    const key = { trainee_id: traineeId, task_id: taskId };
    return prisma.$transaction(async (tx) => {
      const existing = await tx.task_progress.findUnique({
        where: { trainee_id_task_id: key },
        select: { id: true, review_status: true },
      });

      if (existing?.review_status === 'approved') {
        return null; // the service turns this into a 409
      }

      if (!existing) {
        return tx.task_progress.create({
          data: {
            ...key,
            status: 'completed',
            review_status: 'pending',
            submission_count: 1,
            first_submitted_at: submittedAt,
            last_submitted_at: submittedAt,
          },
        });
      }

      // Conditional update: if an admin approves between the read above and this
      // write, the row no longer matches and the submit is refused (409).
      const updated = await tx.task_progress.updateMany({
        where: {
          id: existing.id,
          OR: [{ review_status: null }, { review_status: 'pending' }, { review_status: 'rework' }],
        },
        data: {
          status: 'completed',
          last_submitted_at: submittedAt,
          review_status: 'pending',
          submission_count: { increment: 1 },
        },
      });

      if (updated.count === 0) {
        return null; // approved meanwhile
      }

      return tx.task_progress.findUniqueOrThrow({ where: { id: existing.id } });
    });
  };
}
