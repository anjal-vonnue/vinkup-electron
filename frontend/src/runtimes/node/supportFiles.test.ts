import { describe, expect, it } from 'vitest';
import { isIgnoredPath } from '../../lib/workspaceIgnore';
import { supportFilesFor } from './supportFiles';

const packageJson = (deps: Record<string, string>) => JSON.stringify({ dependencies: deps });

describe('supportFilesFor', () => {
  it('adds the Prisma helper files when the task depends on prisma-pglite', () => {
    const files = supportFilesFor({ 'package.json': packageJson({ 'prisma-pglite': '^3.0.2' }) });
    expect(Object.keys(files).sort()).toEqual([
      '.vinkup/prisma/adapter.d.mts',
      '.vinkup/prisma/adapter.mjs',
      '.vinkup/prisma/cli.mjs',
      '.vinkup/prisma/engine.mjs',
    ]);
  });

  it('adds nothing for other Node tasks', () => {
    expect(supportFilesFor({ 'package.json': packageJson({ express: '^4.21.1' }) })).toEqual({});
    expect(supportFilesFor({ 'index.js': 'console.log(1)' })).toEqual({});
  });

  it('adds nothing when package.json is broken', () => {
    expect(supportFilesFor({ 'package.json': '{ "dependencies": ' })).toEqual({});
  });

  it('only writes files the workspace ignores, so trainees never see or save them', () => {
    const files = supportFilesFor({ 'package.json': packageJson({ 'prisma-pglite': '^3.0.2' }) });
    for (const path of Object.keys(files)) expect(isIgnoredPath(path)).toBe(true);
  });
});
