import type {
  DesktopApi,
  RunApi,
  TerminalApi,
  WorkspaceApi,
  WorkspaceConsoleLevel,
  WorkspaceEvent,
} from '@itp/types';
import { isIgnoredPath } from '../../lib/workspaceIgnore';
import { supportFilesFor } from '../node/supportFiles';

/**
 * The host runtime is opt-in for the desktop shell only. `VITE_WORKSPACE_RUNTIME=webcontainer`
 * keeps the old in-browser stack until the local one is signed off on a packaged build.
 */
export function isLocalRuntimeEnabled(): boolean {
  if (import.meta.env.VITE_WORKSPACE_RUNTIME === 'webcontainer') return false;
  return typeof window !== 'undefined' && Boolean(window.desktop?.workspace);
}

function desktop(): DesktopApi | undefined {
  return typeof window === 'undefined' ? undefined : window.desktop;
}

export function getWorkspaceApi(): WorkspaceApi | null {
  return desktop()?.workspace ?? null;
}

export function getTerminalApi(): TerminalApi | null {
  return desktop()?.terminal ?? null;
}

export function getRunApi(): RunApi | null {
  return desktop()?.run ?? null;
}

const CONSOLE_LEVELS: readonly WorkspaceConsoleLevel[] = ['log', 'info', 'warn', 'error'];

/** The files worth mirroring to disk (same ignore rules as the editor). */
export function filesForWorkspace(files: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (isIgnoredPath(path)) continue;
    result[path] = content;
  }
  return result;
}

/** Hidden Prisma helpers live under .vinkup/ and never reach the editor. */
export function supportFilesForWorkspace(files: Record<string, string>): Record<string, string> {
  return supportFilesFor(files);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Events are typed at the preload boundary, but they still cross a process boundary. */
export function isWorkspaceEvent(value: unknown): value is WorkspaceEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.taskId !== 'string') return false;

  switch (event.type) {
    case 'console':
      return (
        typeof event.runId === 'string' &&
        typeof event.level === 'string' &&
        CONSOLE_LEVELS.includes(event.level as WorkspaceConsoleLevel) &&
        isStringArray(event.args) &&
        typeof event.ts === 'number'
      );
    case 'console-clear':
      return typeof event.runId === 'string';
    case 'preview-ready':
      return typeof event.runId === 'string' && typeof event.url === 'string';
    case 'file-changed':
      return (
        typeof event.path === 'string' &&
        (event.content === null || typeof event.content === 'string')
      );
    case 'run-output':
      return (
        (event.kind === 'install' || event.kind === 'dev') &&
        (event.stream === 'stdout' || event.stream === 'stderr') &&
        typeof event.data === 'string'
      );
    case 'run-exited':
      return (
        (event.kind === 'install' || event.kind === 'dev') && typeof event.exitCode === 'number'
      );
    case 'server-ready':
      return typeof event.port === 'number' && typeof event.url === 'string';
    case 'server-closed':
      return typeof event.port === 'number';
    default:
      return false;
  }
}
