import type { CheckpointWorkspaceFile } from '@itp/types';

/**
 * Desktop workspaces are keyed by a task id that must match `[A-Za-z0-9_-]{1,64}`.
 * A checkpoint question gets its own stable key so two practical questions in the
 * same attempt never share a folder (and its node_modules).
 */
export function checkpointWorkspaceId(attemptId: string, orderIndex: number): string {
  const id = `cp-${attemptId}-q${orderIndex}`;
  return id.length <= 64 ? id : `cp-${attemptId.slice(0, 40)}-q${orderIndex}`;
}

export function workspaceFilesFromRecord(files: Record<string, string>): CheckpointWorkspaceFile[] {
  return Object.keys(files)
    .sort()
    .map((path) => ({ path, content: files[path] }));
}

export function workspaceFilesSignature(files: CheckpointWorkspaceFile[]): string {
  return JSON.stringify([...files].sort((left, right) => left.path.localeCompare(right.path)));
}
