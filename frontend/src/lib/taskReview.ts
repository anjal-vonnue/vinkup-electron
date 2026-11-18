import type { AdminTaskRow } from '@itp/types';

/** Where a task stands from the mentor's point of view. */
export type TaskReviewState = 'in_progress' | 'pending' | 'approved' | 'rework';

/** The filter buttons on the Tasks tab: one per state, plus "All". */
export type TaskReviewFilter = 'all' | TaskReviewState;

export const TASK_REVIEW_LABELS: Record<TaskReviewState, string> = {
  pending: 'Pending review',
  approved: 'Approved',
  rework: 'Rework',
  in_progress: 'In progress',
};

/** The order of the filter buttons. */
export const TASK_REVIEW_FILTERS: TaskReviewFilter[] = [
  'all',
  'pending',
  'approved',
  'rework',
  'in_progress',
];

/**
 * A submitted task is "completed". Its review status then says what the mentor did.
 * No review status yet (old submissions from before reviews existed) also means it is
 * waiting for the mentor, so it counts as pending.
 */
export function getTaskReviewState(task: AdminTaskRow): TaskReviewState {
  if (task.status !== 'completed') {
    return 'in_progress';
  }
  if (task.reviewStatus === 'approved') {
    return 'approved';
  }
  if (task.reviewStatus === 'rework') {
    return 'rework';
  }
  return 'pending';
}

/** How many tasks are in each state, plus the total for "All". */
export function countTasksByReviewState(tasks: AdminTaskRow[]): Record<TaskReviewFilter, number> {
  const counts: Record<TaskReviewFilter, number> = {
    all: tasks.length,
    pending: 0,
    approved: 0,
    rework: 0,
    in_progress: 0,
  };

  for (const task of tasks) {
    counts[getTaskReviewState(task)] += 1;
  }

  return counts;
}
