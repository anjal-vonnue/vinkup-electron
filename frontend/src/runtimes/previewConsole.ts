export type ConsoleLevel =
  'log' | 'info' | 'warn' | 'error' | 'debug' | 'runtime' | 'build' | 'system';

export type ConsoleEntry = {
  id: number;
  ts: number;
  level: ConsoleLevel;
  text: string;
  source?: string;
};

/** Where a task's simulated preview localStorage is kept in the platform page. */
export function storageKey(taskId: string): string {
  return `itp.preview.storage.${taskId}`;
}
