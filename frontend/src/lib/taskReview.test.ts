import { describe, expect, it } from 'vitest';
import type { AdminTaskRow } from '@itp/types';
import { countTasksByReviewState, getTaskReviewState } from './taskReview';

function buildTask(overrides: Partial<AdminTaskRow>): AdminTaskRow {
  return {
    taskId: 't1',
    title: 'Task',
    sequenceOrder: 1,
    dayId: 'day-1',
    isStretchGoal: false,
    status: 'completed',
    reviewStatus: null,
    submissionCount: 1,
    codeUpdatedAt: null,
    lastSubmittedAt: null,
    ...overrides,
  };
}

describe('getTaskReviewState', () => {
  it('uses the review status of a submitted task', () => {
    expect(getTaskReviewState(buildTask({ reviewStatus: 'pending' }))).toBe('pending');
    expect(getTaskReviewState(buildTask({ reviewStatus: 'approved' }))).toBe('approved');
    expect(getTaskReviewState(buildTask({ reviewStatus: 'rework' }))).toBe('rework');
  });

  it('treats a submitted task with no review yet as pending', () => {
    expect(getTaskReviewState(buildTask({ reviewStatus: null }))).toBe('pending');
  });

  it('treats a task that is not submitted as in progress', () => {
    expect(getTaskReviewState(buildTask({ status: 'in_progress' }))).toBe('in_progress');
    expect(getTaskReviewState(buildTask({ status: 'not_started' }))).toBe('in_progress');
  });
});

describe('countTasksByReviewState', () => {
  it('counts each state and the total', () => {
    const tasks = [
      buildTask({ taskId: 'a', reviewStatus: 'approved' }),
      buildTask({ taskId: 'b', reviewStatus: 'approved' }),
      buildTask({ taskId: 'c', reviewStatus: 'rework' }),
      buildTask({ taskId: 'd', reviewStatus: null }),
      buildTask({ taskId: 'e', status: 'in_progress' }),
    ];

    expect(countTasksByReviewState(tasks)).toEqual({
      all: 5,
      pending: 1,
      approved: 2,
      rework: 1,
      in_progress: 1,
    });
  });

  it('returns zeros for no tasks', () => {
    expect(countTasksByReviewState([])).toEqual({
      all: 0,
      pending: 0,
      approved: 0,
      rework: 0,
      in_progress: 0,
    });
  });
});
