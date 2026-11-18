import type { IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';
import type { WorkspaceOpenResult } from '@itp/types';
import { MAX_FILES, MAX_FILE_CHARS, MAX_PATH_CHARS } from './paths';
import { WorkspaceManager, assertTaskId } from './manager';
import { runLighthouseAudit } from '../lighthouse';

const MAX_TOTAL_FILES_CHARS = 5_000_000;

export type WorkspaceIpcOptions = {
  manager: WorkspaceManager;
  assertTrustedSender: (event: IpcMainInvokeEvent) => void;
};

type ParsedOpen = {
  taskId: string;
  files: Record<string, string>;
  supportFiles: Record<string, string> | undefined;
};

function parseFileMap(value: unknown, label: string): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid ${label}.`);
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_FILES) throw new Error(`Too many ${label}.`);

  const files: Record<string, string> = {};
  let totalChars = 0;
  for (const [key, content] of entries) {
    if (key.length === 0 || key.length > MAX_PATH_CHARS) {
      throw new Error(`Invalid path in ${label}.`);
    }
    if (typeof content !== 'string') {
      throw new Error(`Invalid file content in ${label}.`);
    }
    // Same limits as the write-through: an oversized file is left out, not fatal.
    if (content.length > MAX_FILE_CHARS) continue;
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_FILES_CHARS) throw new Error(`${label} are too large.`);
    files[key] = content;
  }
  return files;
}

function parseOpenInput(value: unknown): ParsedOpen {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid workspace input.');
  const record = value as Record<string, unknown>;
  return {
    taskId: assertTaskId(record.taskId),
    files: parseFileMap(record.files, 'workspace files'),
    supportFiles:
      record.supportFiles === undefined
        ? undefined
        : parseFileMap(record.supportFiles, 'workspace support files'),
  };
}

function parseSyncInput(value: unknown): {
  taskId: string;
  files: Record<string, string>;
  supportFiles: Record<string, string> | undefined;
} {
  return parseOpenInput(value);
}

/** Registers the workspace surface. Every channel checks the sender and its arguments. */
export function registerWorkspaceIpc({ manager, assertTrustedSender }: WorkspaceIpcOptions): void {
  ipcMain.handle('workspace:open', (event, input: unknown): Promise<WorkspaceOpenResult> => {
    assertTrustedSender(event);
    return manager.open(parseOpenInput(input));
  });

  ipcMain.handle('workspace:sync', async (event, input: unknown) => {
    assertTrustedSender(event);
    const parsed = parseSyncInput(input);
    await manager.sync(parsed.taskId, parsed.files, parsed.supportFiles);
  });

  ipcMain.handle('workspace:reload', (event, taskId: unknown) => {
    assertTrustedSender(event);
    return manager.reload(taskId);
  });

  ipcMain.handle('workspace:close', async (event, taskId: unknown) => {
    assertTrustedSender(event);
    await manager.close(taskId);
  });

  ipcMain.handle('workspace:get-environment', (event) => {
    assertTrustedSender(event);
    return manager.getEnvironment();
  });

  ipcMain.handle('terminal:open', (event, input: unknown) => {
    assertTrustedSender(event);
    return manager.openTerminal(input);
  });

  ipcMain.handle('terminal:write', async (event, terminalId: unknown, data: unknown) => {
    assertTrustedSender(event);
    await manager.writeTerminal(terminalId, data);
  });

  ipcMain.handle(
    'terminal:resize',
    async (event, terminalId: unknown, cols: unknown, rows: unknown) => {
      assertTrustedSender(event);
      await manager.resizeTerminal(terminalId, cols, rows);
    }
  );

  ipcMain.handle('terminal:close', async (event, terminalId: unknown) => {
    assertTrustedSender(event);
    await manager.closeTerminal(terminalId);
  });

  ipcMain.handle('lighthouse:run', async (event, taskId: unknown) => {
    assertTrustedSender(event);

    const previewUrl = manager.getPreviewUrl(taskId);
    return runLighthouseAudit(previewUrl);
  });

  ipcMain.handle('run:install', async (event, taskId: unknown) => {
    assertTrustedSender(event);
    await manager.install(taskId);
  });

  ipcMain.handle('run:dev', async (event, taskId: unknown, command: unknown) => {
    assertTrustedSender(event);
    await manager.dev(taskId, command);
  });

  ipcMain.handle('run:stop', async (event, taskId: unknown) => {
    assertTrustedSender(event);
    await manager.stop(taskId);
  });
}
