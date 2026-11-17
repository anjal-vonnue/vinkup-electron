import { prisma } from '../../lib/prisma';

type ReviewOutcome = { ok: true } | { ok: false; reason: 'not-submitted' | 'already-reviewed' };

/** What one review action writes: the decision and its optional feedback. */
export type ReviewInput = {
  traineeId: string;
  taskId: string;
  adminId: string;
  decision: 'approved' | 'rework';
  feedback: string;
};

export class ReviewRepository {
  findTrainee = (id: string) => prisma.trainee.findUnique({ where: { id }, select: { id: true } });

  findTask = (taskId: string) =>
    prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, curriculum_day_id: true },
    });

  findProgress = (traineeId: string, taskId: string) =>
    prisma.task_progress.findUnique({
      where: { trainee_id_task_id: { trainee_id: traineeId, task_id: taskId } },
      select: { status: true, review_status: true, submission_count: true },
    });

  /**
   * Creates the history row and flips task_progress.review_status in ONE transaction,
   * so the current status and the history can never disagree.
   *
   * The state check happens again inside the transaction: two admins reviewing the
   * same attempt at the same moment is also caught by the (trainee, task,
   * submission_no) unique index, which surfaces as 'already-reviewed'.
   */
  createReview = async (input: ReviewInput): Promise<ReviewOutcome> => {
    try {
      return await prisma.$transaction(async (tx) => {
        const progress = await tx.task_progress.findUnique({
          where: { trainee_id_task_id: { trainee_id: input.traineeId, task_id: input.taskId } },
          select: { status: true, review_status: true, submission_count: true },
        });

        if (!progress || progress.status !== 'completed') {
          return { ok: false, reason: 'not-submitted' } as const;
        }
        if (progress.review_status === 'approved' || progress.review_status === 'rework') {
          return { ok: false, reason: 'already-reviewed' } as const;
        }

        // Conditional on the attempt we just read: if the trainee resubmitted in
        // the meantime, submission_count changed and this review is refused so
        // the new attempt can be reviewed instead.
        const updated = await tx.task_progress.updateMany({
          where: {
            trainee_id: input.traineeId,
            task_id: input.taskId,
            status: 'completed',
            submission_count: progress.submission_count,
            OR: [{ review_status: null }, { review_status: 'pending' }],
          },
          data: { review_status: input.decision },
        });

        if (updated.count === 0) {
          return { ok: false, reason: 'already-reviewed' } as const;
        }

        await tx.task_review.create({
          data: {
            trainee_id: input.traineeId,
            task_id: input.taskId,
            admin_id: input.adminId,
            submission_no: progress.submission_count,
            decision: input.decision,
            feedback: input.feedback,
          },
        });

        return { ok: true } as const;
      });
    } catch (error) {
      // Two reviews for one attempt: the unique index rejected the second one.
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: unknown }).code === 'P2002'
      ) {
        return { ok: false, reason: 'already-reviewed' } as const;
      }
      throw error;
    }
  };

  /** This trainee's review history for one task, newest first. */
  listTaskReviews = (traineeId: string, taskId: string) =>
    prisma.task_review.findMany({
      where: { trainee_id: traineeId, task_id: taskId },
      orderBy: [{ reviewed_at: 'desc' }, { created_at: 'desc' }],
      select: {
        id: true,
        trainee_id: true,
        task_id: true,
        admin_id: true,
        submission_no: true,
        decision: true,
        feedback: true,
        reviewed_at: true,
        admin: { select: { name: true } },
      },
      take: 200,
    });

  /** Every feedback-bearing review of this trainee, newest first. */
  listTraineeFeedback = (traineeId: string) =>
    prisma.task_review.findMany({
      where: { trainee_id: traineeId, feedback: { not: '' } },
      orderBy: [{ reviewed_at: 'desc' }, { created_at: 'desc' }],
      select: {
        id: true,
        trainee_id: true,
        admin_id: true,
        submission_no: true,
        decision: true,
        feedback: true,
        reviewed_at: true,
        admin: { select: { name: true } },
        task: { select: { id: true, title: true, curriculum_day_id: true } },
      },
      take: 200,
    });
}
