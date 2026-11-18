import { describe, expect, it } from 'vitest';
import { saveCodeBodySchema, taskIdParamsSchema } from './task.schema.js';

const file = (path: string, content = '') => ({ path, content });

describe('saveCodeBodySchema', () => {
  it('accepts nested relative paths, an empty list, and the size limits', () => {
    expect(saveCodeBodySchema.safeParse({ files: [] }).success).toBe(true);
    expect(saveCodeBodySchema.safeParse({ files: [file('src/app/main.ts', 'x')] }).success).toBe(
      true
    );
    expect(
      saveCodeBodySchema.safeParse({ files: [file('big.txt', 'x'.repeat(200_000))] }).success
    ).toBe(true);
    const twoHundred = Array.from({ length: 200 }, (_, i) => file(`f${i}.txt`));
    expect(saveCodeBodySchema.safeParse({ files: twoHundred }).success).toBe(true);
  });

  it.each([
    ['an absolute path', [file('/etc/passwd')]],
    ['a "." folder', [file('./index.html')]],
    ['an empty folder', [file('src//app.js')]],
    ['a trailing slash', [file('src/')]],
    ['a NUL character in a path', [file('a\u0000b.txt')]],
    ['a NUL character in a file', [file('data.txt', 'a\u0000b')]],
    ['half of an emoji in a file', [file('emoji.txt', 'half \uD83D pair')]],
    ['a path going up a folder', [file('src/../../secret.txt')]],
    ['a backslash', [file('src\\app.js')]],
    ['an empty path', [file('')]],
    ['a path over 200 characters', [file('a'.repeat(201))]],
    ['two files with the same path', [file('index.html'), file('index.html')]],
    ['a file over 200,000 characters', [file('a.txt', 'x'.repeat(200_001))]],
    ['more than 200 files', Array.from({ length: 201 }, (_, i) => file(`f${i}.txt`))],
  ])('rejects %s', (_label, files) => {
    expect(saveCodeBodySchema.safeParse({ files }).success).toBe(false);
  });

  it('allows dotfiles, file names with two dots, spaces and whole emoji', () => {
    const files = [file('.env'), file('notes..md'), file('my file.txt'), file('a.txt', '😀')];
    expect(saveCodeBodySchema.safeParse({ files }).success).toBe(true);
  });
});

describe('taskIdParamsSchema', () => {
  it('accepts curriculum task ids and rejects anything else', () => {
    expect(taskIdParamsSchema.safeParse({ taskId: 'css-day-03-t-2' }).success).toBe(true);
    expect(taskIdParamsSchema.safeParse({ taskId: 'CSS DAY 3' }).success).toBe(false);
    expect(taskIdParamsSchema.safeParse({ taskId: '' }).success).toBe(false);
  });
});
