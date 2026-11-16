import { describe, expect, it } from 'vitest';
import { filesForWorkspace, isWorkspaceEvent, supportFilesForWorkspace } from './localWorkspace';

describe('filesForWorkspace', () => {
  it('leaves out ignored folders and files', () => {
    const files = filesForWorkspace({
      'index.html': '<h1>Hi</h1>',
      'src/app.ts': 'export {};',
      'node_modules/pkg/index.js': 'x',
      'package-lock.json': '{}',
      'debug.log': 'x',
      '.vinkup/prisma/engine.mjs': 'x',
    });

    expect(files).toEqual({ 'index.html': '<h1>Hi</h1>', 'src/app.ts': 'export {};' });
  });

  it('only adds Prisma support files when the task depends on prisma-pglite', () => {
    expect(supportFilesForWorkspace({ 'package.json': '{"dependencies":{}}' })).toEqual({});

    const files = supportFilesForWorkspace({
      'package.json': '{"devDependencies":{"prisma-pglite":"1.0.0"}}',
    });
    expect(Object.keys(files)).toContain('.vinkup/prisma/engine.mjs');
  });
});

describe('isWorkspaceEvent', () => {
  it('accepts well-formed console and server events', () => {
    expect(
      isWorkspaceEvent({
        type: 'console',
        taskId: 't1',
        runId: 'run-1',
        level: 'warn',
        args: ['careful'],
        ts: 1,
      })
    ).toBe(true);

    expect(
      isWorkspaceEvent({
        type: 'server-ready',
        taskId: 't1',
        port: 5173,
        url: 'http://localhost:5173',
      })
    ).toBe(true);
  });

  it('rejects unknown types and malformed payloads', () => {
    expect(isWorkspaceEvent({ type: 'nope', taskId: 't1' })).toBe(false);
    expect(
      isWorkspaceEvent({
        type: 'console',
        taskId: 't1',
        runId: 'r',
        level: 'trace',
        args: [],
        ts: 1,
      })
    ).toBe(false);
    expect(
      isWorkspaceEvent({ type: 'file-changed', taskId: 't1', path: 'a.txt', content: 5 })
    ).toBe(false);
    expect(isWorkspaceEvent(null)).toBe(false);
  });
});
