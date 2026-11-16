import type { DayTask, ReviewStatus } from '@itp/types';
import { assertDayIsAccessible } from './day-access.services';
import { dayTasksRepository } from './day-tasks.repository';

type TaskRow = Awaited<ReturnType<typeof dayTasksRepository.findTasksByDay>>[number];
type TaskStatus = DayTask['status'];

// If a DayTask field is missing or extra, TypeScript will point at this function:
// this is the only place that decides the shape of one task in the list.
function toDayTask(task: TaskRow, status: TaskStatus, reviewStatus: string | null): DayTask {
  return {
    id: task.id,
    title: task.title,
    sequenceOrder: task.sequence_order,
    isStretchGoal: task.is_stretch_goal,
    status,
    // Only a completed (submitted) task can have a review state.
    reviewStatus: status === 'completed' ? (reviewStatus as ReviewStatus | null) : null,
  };
}

export const dayTasksService = {
  async getDayTasks(traineeId: string, dayId: string): Promise<DayTask[]> {
    await assertDayIsAccessible(traineeId, dayId);

    // Two queries in total, however many tasks the day has (no query per task).
    const [tasks, progressRows] = await Promise.all([
      dayTasksRepository.findTasksByDay(dayId),
      dayTasksRepository.findProgressByDay(traineeId, dayId),
    ]);

    const statusByTaskId = new Map(progressRows.map((row) => [row.task_id, row]));

    // No progress row yet means the trainee hasn't opened the task.
    return tasks.map((task) => {
      const row = statusByTaskId.get(task.id);
      return toDayTask(task, row?.status ?? 'not_started', row?.review_status ?? null);
    });
  },
};
