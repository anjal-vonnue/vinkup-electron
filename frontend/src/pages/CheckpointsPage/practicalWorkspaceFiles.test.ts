import { describe, expect, it } from 'vitest';
import type { CheckpointWorkspaceFile } from '@itp/types';
import {
  checkpointWorkspaceId,
  runtimeNeedsPostgres,
  workspaceFilesFromRecord,
  workspaceFilesSignature,
  workspaceRuntimeFor,
} from './practicalWorkspaceFiles';

const DESKTOP_WORKSPACE_ID = /^[A-Za-z0-9_-]{1,64}$/;

describe('workspaceRuntimeFor', () => {
  it('runs SQL checkpoints in the Node terminal against the machine PostgreSQL', () => {
    expect(workspaceRuntimeFor('sql')).toBe('node');
    expect(runtimeNeedsPostgres('sql')).toBe(true);
  });

  it('keeps browser and node questions as they are', () => {
    expect(workspaceRuntimeFor('browser')).toBe('browser');
    expect(workspaceRuntimeFor('node')).toBe('node');
    expect(workspaceRuntimeFor(null)).toBe('node');
    expect(runtimeNeedsPostgres('browser')).toBe(false);
    expect(runtimeNeedsPostgres('node')).toBe(false);
    expect(runtimeNeedsPostgres(null)).toBe(false);
  });
});

describe('checkpointWorkspaceId', () => {
  it('builds a stable id per attempt and question', () => {
    const first = checkpointWorkspaceId('attempt-1', 1);
    const second = checkpointWorkspaceId('attempt-1', 2);

    expect(first).toBe('cp-attempt-1-q1');
    expect(second).toBe('cp-attempt-1-q2');
    expect(first).not.toBe(second);
    expect(first).toMatch(DESKTOP_WORKSPACE_ID);
  });

  it('keeps long attempt ids within the desktop id limit', () => {
    const id = checkpointWorkspaceId('a'.repeat(80), 12);

    expect(id.length).toBeLessThanOrEqual(64);
    expect(id).toMatch(DESKTOP_WORKSPACE_ID);
    expect(id.endsWith('-q12')).toBe(true);
  });
});

describe('workspaceFilesFromRecord', () => {
  it('converts a runtime file record into sorted workspace files', () => {
    expect(
      workspaceFilesFromRecord({
        'src/index.ts': 'console.log(1);',
        'package.json': '{}',
      })
    ).toEqual([
      { path: 'package.json', content: '{}' },
      { path: 'src/index.ts', content: 'console.log(1);' },
    ]);
  });

  it('returns an empty list for an empty workspace', () => {
    expect(workspaceFilesFromRecord({})).toEqual([]);
  });
});

describe('workspaceFilesSignature', () => {
  const files: CheckpointWorkspaceFile[] = [
    { path: 'b.txt', content: 'two' },
    { path: 'a.txt', content: 'one' },
  ];

  it('does not depend on file order', () => {
    expect(workspaceFilesSignature([...files].reverse())).toBe(workspaceFilesSignature(files));
  });

  it('changes when content changes', () => {
    const changed: CheckpointWorkspaceFile[] = [
      { path: 'a.txt', content: 'one' },
      { path: 'b.txt', content: 'three' },
    ];

    expect(workspaceFilesSignature(changed)).not.toBe(workspaceFilesSignature(files));
  });
});
