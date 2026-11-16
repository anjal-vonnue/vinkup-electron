import type { AdminFeedbackEntry, TaskReview, TaskReviewSummary } from '@itp/types';
import { ConflictError, NotFoundError, TaskNotSubmittedError } from '../../errors/AppError';
import { ProgressService } from '../progress-module/progress.service';
import { ReviewRepository } from './review.repository';

const reviewRepository = new ReviewRepository();
const progressService = new ProgressService();

type ReviewRow = Awaited<ReturnType<typeof ReviewRepository.prototype.listTaskReviews>>[number];
type FeedbackRow = Awaited<
  ReturnType<typeof ReviewRepository.prototype.listTraineeFeedback>
>[number];

function toTaskReview(row: ReviewRow | FeedbackRow): TaskReview & { taskId: string } {
  return {
    id: row.id,
    taskId: 'task_id' in row ? row.task_id : row.task.id,
    adminId: row.admin_id,
    adminName: row.admin.name,
    submissionNo: row.submission_no,
    decision: row.decision,
    feedback: row.feedback,
    reviewedAt: row.reviewed_at.toISOString(),
  };
}

/** A review action may only target a submission that is still waiting for a decision. */
function assertAwaitingReview(
  progress: { status: string; review_status: string | null } | null
): void {
  if (!progress || progress.status !== 'completed') {
    throw new TaskNotSubmittedError();
  }
  if (progress.review_status === 'approved') {
    throw new ConflictError('ALREADY_REVIEWED', 'This submission was already approved.');
  }
  if (progress.review_status === 'rework') {
    throw new ConflictError(
      'ALREADY_REVIEWED',
      'This submission was already sent back for rework. The trainee has to resubmit it first.'
    );
  }
}

function assertOutcome(
  outcome: { ok: true } | { ok: false; reason: 'not-submitted' | 'already-reviewed' }
): void {
  if (outcome.ok) return;
  if (outcome.reason === 'not-submitted') throw new TaskNotSubmittedError();
  throw new ConflictError(
    'ALREADY_REVIEWED',
    'This submission was already reviewed while you were writing yours.'
  );
}

export class ReviewService {
  // ---------- Admin actions ----------

  /** POST /api/admin/trainees/:traineeId/tasks/:taskId/approve */
  approve = async (
    traineeId: string,
    taskId: string,
    adminId: string,
    feedback = ''
  ): Promise<TaskReview> => this.decide(traineeId, taskId, adminId, 'approved', feedback);

  /** POST /api/admin/trainees/:traineeId/tasks/:taskId/rework */
  requestRework = async (
    traineeId: string,
    taskId: string,
    adminId: string,
    feedback: string
  ): Promise<TaskReview> => this.decide(traineeId, taskId, adminId, 'rework', feedback);

  /** GET /api/admin/trainees/:traineeId/tasks/:taskId/reviews */
  getTaskReviews = async (traineeId: string, taskId: string): Promise<TaskReview[]> => {
    await this.assertTraineeAndTask(traineeId, taskId);
    const rows = await reviewRepository.listTaskReviews(traineeId, taskId);
    return rows.map(toTaskReview);
  };

  /** GET /api/admin/trainees/:traineeId/feedback */
  listTraineeFeedback = async (traineeId: string): Promise<AdminFeedbackEntry[]> => {
    const trainee = await reviewRepository.findTrainee(traineeId);
    if (!trainee) throw new NotFoundError('Trainee not found.');

    const rows = await reviewRepository.listTraineeFeedback(traineeId);
    return rows.map((row) => ({
      id: row.id,
      taskId: row.task.id,
      taskTitle: row.task.title,
      dayId: row.task.curriculum_day_id,
      adminId: row.admin_id,
      adminName: row.admin.name,
      submissionNo: row.submission_no,
      decision: row.decision,
      feedback: row.feedback,
      reviewedAt: row.reviewed_at.toISOString(),
    }));
  };

  // ---------- Trainee actions ----------

  /** GET /api/tasks/:taskId/review — own review state plus the latest feedback. */
  getReview = async (traineeId: string, taskId: string): Promise<TaskReviewSummary> => {
    await progressService.assertTaskUnlocked(traineeId, taskId);

    const [progress, reviews] = await Promise.all([
      reviewRepository.findProgress(traineeId, taskId),
      reviewRepository.listTaskReviews(traineeId, taskId),
    ]);

    return {
      reviewStatus: progress?.review_status ?? null,
      submissionCount: progress?.submission_count ?? 0,
      latestReview: reviews.length > 0 ? toTaskReview(reviews[0]) : null,
    };
  };

  /** GET /api/tasks/:taskId/reviews — own review history, newest first. */
  getReviews = async (traineeId: string, taskId: string): Promise<TaskReview[]> => {
    await progressService.assertTaskUnlocked(traineeId, taskId);
    const rows = await reviewRepository.listTaskReviews(traineeId, taskId);
    return rows.map(toTaskReview);
  };

  // ---------- internals ----------

  private async decide(
    traineeId: string,
    taskId: string,
    adminId: string,
    decision: 'approved' | 'rework',
    feedback: string
  ): Promise<TaskReview> {
    await this.assertTraineeAndTask(traineeId, taskId);

    // Fast path: a clean error before opening a transaction.
    assertAwaitingReview(await reviewRepository.findProgress(traineeId, taskId));

    // Slow path: re-checked and written atomically.
    assertOutcome(
      await reviewRepository.createReview({ traineeId, taskId, adminId, decision, feedback })
    );

    const rows = await reviewRepository.listTaskReviews(traineeId, taskId);
    return toTaskReview(rows[0]);
  }

  private assertTraineeAndTask = async (traineeId: string, taskId: string) => {
    const [trainee, task] = await Promise.all([
      reviewRepository.findTrainee(traineeId),
      reviewRepository.findTask(taskId),
    ]);
    if (!trainee) throw new NotFoundError('Trainee not found.');
    if (!task) throw new NotFoundError('Task not found.');
  };
}
