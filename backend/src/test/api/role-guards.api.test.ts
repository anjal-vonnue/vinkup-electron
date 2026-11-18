import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app.js';
import { env } from '../../config/env.js';
import { AUTH_COOKIE_NAME } from '../../module/auth-module/auth.constants.js';
import {
  DAY,
  TASK,
  createAdmin,
  freshTrainees,
  seedCurriculum,
  type TestAdmin,
  type TestTrainee,
} from './helpers/fixtures.js';
import { api, body, expectError } from './helpers/http.js';

// Admins are not trainees: every trainee endpoint must refuse them with 403,
// while trainees (including tokens issued before roles existed) keep working.

const traineeEndpoints: [method: 'get' | 'post' | 'put' | 'patch', path: string, body?: object][] =
  [
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
    ['get', '/api/courses/html/days'],
    ['get', '/api/courses/html/certificate'], // new
    ['get', `/api/days/${DAY.html1}`],
  ];

let a: TestTrainee;
let admin: TestAdmin;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a } = await freshTrainees());
  admin = await createAdmin();
});

describe.each(traineeEndpoints)('%s %s as an admin', (method, path, payload) => {
  it('returns 403 FORBIDDEN', async () => {
    const res = await request(app)[method](path).set('Cookie', admin.cookie).send(payload);
    expectError(res, 403, 'FORBIDDEN');
  });
});

describe('trainees are unaffected', () => {
  it('a trainee token still reaches trainee endpoints', async () => {
    const res = await api.get('/api/dashboard', a.cookie);
    expect(res.status).toBe(200);
  });

  it('a token issued before roles existed still works for a trainee', async () => {
    const legacy = jwt.sign({ id: a.id, name: a.name, email: a.email }, env.JWT_SECRET, {
      expiresIn: '1h',
    });

    const res = await api.get('/api/dashboard', `${AUTH_COOKIE_NAME}=${legacy}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/auth/me', () => {
  it('returns role "trainee" for a trainee', async () => {
    const res = await api.get('/api/auth/me', a.cookie);
    expect(res.status).toBe(200);
    expect(body<{ role: string }>(res).role).toBe('trainee');
  });

  it('returns role "mentor" for an admin', async () => {
    const res = await api.get('/api/auth/me', admin.cookie);
    expect(res.status).toBe(200);
    expect(body<{ role: string; email: string }>(res)).toMatchObject({
      role: 'mentor',
      email: admin.email,
    });
  });
});
