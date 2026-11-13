import type { DayTask, TaskCodeResponse, TaskResponse, TaskStatus } from '@itp/types';
import { cssDays } from './catalog/css';
import { htmlDays } from './catalog/html';
import { javascriptDays } from './catalog/javascript';
import { nodejsDays } from './catalog/nodejs';
import { postgresqlDays } from './catalog/postgresql';
import { prismaDays } from './catalog/prisma';
import { reactDays } from './catalog/react';
import { typescriptDays } from './catalog/typescript';
import { workspaceForDay } from './starters';
import type { CatalogDay, CatalogTask } from './types';

export { scenarios } from './scenarios';
export type { Scenario } from './scenarios';

/** Every course day from the Phase 1 and Phase 2 guides, in course order. */
export const catalogDays: CatalogDay[] = [
  ...htmlDays,
  ...cssDays,
  ...javascriptDays,
  ...typescriptDays,
  ...nodejsDays,
  ...postgresqlDays,
  ...prismaDays,
  ...reactDays,
];

const byTaskId = new Map<string, { day: CatalogDay; task: CatalogTask }>(
  catalogDays.flatMap((day) => day.tasks.map((task) => [task.id, { day, task }] as const))
);

export function findCatalogTask(taskId: string): { day: CatalogDay; task: CatalogTask } | null {
  return byTaskId.get(taskId) ?? null;
}

/** GET /tasks/:id for a real curriculum task. */
export function catalogTaskResponse(taskId: string, status: TaskStatus): TaskResponse | null {
  const found = findCatalogTask(taskId);
  if (!found) return null;
  const { day, task } = found;
  const workspace = workspaceForDay(day.dayId);
  return {
    ...task,
    status,
    reviewStatus: null,
    submissionCount: 0,
    day: { id: day.dayId, dayNumber: day.dayNumber, courseTitle: day.courseTitle },
    runtime: workspace.runtime,
    runCommand: workspace.runCommand,
    setupSql: workspace.setupSql,
  };
}

/** GET /tasks/:id/code before the trainee has saved anything. */
export function catalogTaskCode(taskId: string): TaskCodeResponse | null {
  const found = findCatalogTask(taskId);
  if (!found) return null;
  return { files: workspaceForDay(found.day.dayId).starterFiles(found.task), updatedAt: null };
}

/** GET /days/:dayId/tasks, built from the same catalog so titles match the task page. */
export function catalogDayTasks(dayId: string, status: TaskStatus): DayTask[] {
  const day = catalogDays.find((d) => d.dayId === dayId);
  if (!day) return [];
  return day.tasks.map((task) => ({
    id: task.id,
    sequenceOrder: task.sequenceOrder,
    title: task.title,
    status,
    isStretchGoal: task.isStretchGoal,
  }));
}
