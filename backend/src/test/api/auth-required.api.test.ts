import { beforeAll, describe, it } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { AUTH_COOKIE_NAME } from '../../module/auth-module/auth.constants.js';
import { DAY, TASK, seedCurriculum } from './helpers/fixtures.js';
import { expectError } from './helpers/http.js';

// Every endpoint that isn't built yet must reject a caller who isn't logged in.

const endpoints: [method: 'get' | 'post' | 'put' | 'patch', path: string, body?: object][] = [
  ['get', '/api/dashboard'],
  ['get', '/api/courses/html/days'],
  ['get', `/api/days/${DAY.html1}`],
  ['get', `/api/days/${DAY.html1}/status`],
  ['get', `/api/days/${DAY.html1}/tasks`],
  ['get', `/api/days/${DAY.html1}/journal`],
  ['put', `/api/days/${DAY.html1}/journal`, { responseText: 'Hello' }],
  ['patch', `/api/days/${DAY.html1}/complete`],
  ['get', `/api/tasks/${TASK.html1Main}`],
  ['get', `/api/tasks/${TASK.html1Main}/code`],
  ['put', `/api/tasks/${TASK.html1Main}/code`, { files: [] }],
  ['post', `/api/tasks/${TASK.html1Main}/submit`],
  ['post', `/api/activity/${TASK.html1Main}/events`, { type: 'TAB_SWITCH' }],
  ['post', '/api/activity/time', { activeSeconds: 60, codingSeconds: 30 }],
  ['get', '/api/activity/time'],
  ['get', '/api/typing-test/results'],
  ['post', '/api/typing-test/results', { wpm: 60, accuracy: 95 }],
  ['get', '/api/profile'],
];

beforeAll(async () => {
  await seedCurriculum();
});

describe.each(endpoints)('%s %s', (method, path, body) => {
  it('returns 401 UNAUTHENTICATED with no login cookie', async () => {
    const res = await request(app)[method](path).send(body);
    expectError(res, 401, 'UNAUTHENTICATED');
  });

  it('returns 401 UNAUTHENTICATED with an invalid token', async () => {
    const res = await request(app)
      [method](path)
      .set('Cookie', `${AUTH_COOKIE_NAME}=not-a-real-token`)
      .send(body);
    expectError(res, 401, 'UNAUTHENTICATED');
  });
});
