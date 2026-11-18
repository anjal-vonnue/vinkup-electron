import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TaskCodeResponse, TaskFile, TaskResponse } from '@itp/types';
import { db } from './helpers/db.js';
import {
  STARTER_FILES,
  TASK,
  freshTrainees,
  markTaskCompleted,
  seedCurriculum,
  type TestTrainee,
} from './helpers/fixtures.js';
import { api, body, expectError, expectIsoDateTime } from './helpers/http.js';

let a: TestTrainee;
let b: TestTrainee;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
});

const url = (taskId: string) => `/api/tasks/${taskId}/code`;

const FILES: TaskFile[] = [
  { path: 'index.html', content: '<!doctype html>\n<h1>Me</h1>\n' },
  { path: 'css/style.css', content: 'h1 { color: teal; }\n' },
];

async function getCode(taskId: string, trainee: TestTrainee): Promise<TaskCodeResponse> {
  const res = await api.get(url(taskId), trainee.cookie);
  expect(res.status).toBe(200);
  return body<TaskCodeResponse>(res);
}

describe('GET /api/tasks/:taskId/code', () => {
  it('returns the starter files with updatedAt null before the first save', async () => {
    expect(await getCode(TASK.html1Main, a)).toEqual({ files: STARTER_FILES, updatedAt: null });
  });

  it('returns 403 DAY_LOCKED for a task on a locked day', async () => {
    expectError(await api.get(url(TASK.html2First), a.cookie), 403, 'DAY_LOCKED');
  });

  it('returns 404 NOT_FOUND for an unknown task', async () => {
    expectError(await api.get(url('html-day-01-t-99'), a.cookie), 404, 'NOT_FOUND');
  });
});

describe('PUT /api/tasks/:taskId/code', () => {
  it('saves with 204 and no body; GET then returns the files and a save time', async () => {
    const put = await api.put(url(TASK.html1Main), { files: FILES }, a.cookie);
    expect(put.status).toBe(204);
    expect(put.text).toBe('');

    const code = await getCode(TASK.html1Main, a);
    expect(code.files).toEqual(FILES);
    expectIsoDateTime(code.updatedAt);
  });

  it('moves a not-started task to in_progress', async () => {
    await api.put(url(TASK.html1Main), { files: FILES }, a.cookie);

    const res = await api.get(`/api/tasks/${TASK.html1Main}`, a.cookie);
    expect(body<TaskResponse>(res).status).toBe('in_progress');
  });

  it('keeps a completed task completed when it is edited again', async () => {
    await markTaskCompleted(a.id, TASK.html1Main);
    await api.put(url(TASK.html1Main), { files: FILES }, a.cookie);

    const res = await api.get(`/api/tasks/${TASK.html1Main}`, a.cookie);
    expect(body<TaskResponse>(res).status).toBe('completed');
  });

  it('replaces the whole file set: a file left out is deleted', async () => {
    await api.put(url(TASK.html1Main), { files: FILES }, a.cookie);
    await api.put(url(TASK.html1Main), { files: [FILES[0]] }, a.cookie);

    expect((await getCode(TASK.html1Main, a)).files).toEqual([FILES[0]]);
  });

  it('accepts an empty file list', async () => {
    const res = await api.put(url(TASK.html1Main), { files: [] }, a.cookie);
    expect(res.status).toBe(204);
    expect((await getCode(TASK.html1Main, a)).files).toEqual([]);
  });

  it('keeps one progress row per trainee and task', async () => {
    await api.put(url(TASK.html1Main), { files: FILES }, a.cookie);
    await api.put(url(TASK.html1Main), { files: FILES }, a.cookie);

    expect(await db.task_progress.count({ where: { trainee_id: a.id } })).toBe(1);
  });

  it("keeps each trainee's code separate", async () => {
    await api.put(url(TASK.html1Main), { files: FILES }, a.cookie);

    expect(await getCode(TASK.html1Main, b)).toEqual({ files: STARTER_FILES, updatedAt: null });
  });

  it('accepts a file of exactly 200,000 characters and 200 files', async () => {
    const big = await api.put(
      url(TASK.html1Main),
      { files: [{ path: 'big.txt', content: 'x'.repeat(200000) }] },
      a.cookie
    );
    expect(big.status).toBe(204);

    const many = Array.from({ length: 200 }, (_, i) => ({ path: `f${i}.txt`, content: '' }));
    const manyRes = await api.put(url(TASK.html1Main), { files: many }, a.cookie);
    expect(manyRes.status).toBe(204);
  });

  it.each([
    ['files is missing', {}],
    ['files is not an array', { files: 'index.html' }],
    ['a file has no path', { files: [{ content: 'x' }] }],
    ['a file has no content', { files: [{ path: 'a.txt' }] }],
    ['a path is empty', { files: [{ path: '', content: '' }] }],
    ['a path starts with /', { files: [{ path: '/etc/passwd', content: '' }] }],
    ['a path contains ..', { files: [{ path: '../secret.txt', content: '' }] }],
    ['a path contains a backslash', { files: [{ path: 'src\\app.js', content: '' }] }],
    ['a path is over 200 characters', { files: [{ path: `${'a'.repeat(201)}`, content: '' }] }],
    ['two files share a path', { files: [FILES[0], FILES[0]] }],
    [
      'a file is over 200,000 characters',
      { files: [{ path: 'a.txt', content: 'x'.repeat(200001) }] },
    ],
    [
      'there are over 200 files',
      { files: Array.from({ length: 201 }, (_, i) => ({ path: `f${i}.txt`, content: '' })) },
    ],
  ])('returns 400 VALIDATION_FAILED when %s', async (_label, payload) => {
    expectError(await api.put(url(TASK.html1Main), payload, a.cookie), 400, 'VALIDATION_FAILED');
    expect(await db.task_progress.count()).toBe(0);
  });

  it('returns 403 DAY_LOCKED for a task on a locked day and saves nothing', async () => {
    expectError(await api.put(url(TASK.html2First), { files: FILES }, a.cookie), 403, 'DAY_LOCKED');
    expect(await db.task_progress.count()).toBe(0);
  });

  it('returns 404 NOT_FOUND for an unknown task', async () => {
    expectError(
      await api.put(url('html-day-01-t-99'), { files: FILES }, a.cookie),
      404,
      'NOT_FOUND'
    );
  });
});
