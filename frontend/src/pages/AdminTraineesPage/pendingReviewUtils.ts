import type { AdminTraineeSummary } from '@itp/types';

export type PendingTrainee = {
  traineeId: string;
  traineeName: string;
  taskCount: number;
  latestSubmissionAt: string | null;
};

export function pendingTraineesFromSummaries(trainees: AdminTraineeSummary[]): PendingTrainee[] {
  return trainees
    .map((trainee) => ({
      traineeId: trainee.id,
      traineeName: trainee.name,
      taskCount: trainee.pendingReviewItems.length,
      latestSubmissionAt: trainee.pendingReviewItems.reduce<string | null>((latest, task) => {
        if (!task.lastSubmittedAt) return latest;
        return latest === null || task.lastSubmittedAt > latest ? task.lastSubmittedAt : latest;
      }, null),
    }))
    .filter((trainee) => trainee.taskCount > 0)
    .sort(
      (a, b) =>
        (b.latestSubmissionAt ?? '').localeCompare(a.latestSubmissionAt ?? '') ||
        a.traineeName.localeCompare(b.traineeName)
    );
}
