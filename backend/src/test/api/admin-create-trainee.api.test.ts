import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { AdminTraineeSummary } from '@itp/types';
import app from '../../app.js';
import { signJwt } from '../../utils/jwt.js';
import { AUTH_COOKIE_NAME } from '../../module/auth-module/auth.constants.js';
import { db } from './helpers/db.js';
import {
  DAY,
  createAdmin,
  freshTrainees,
  seedCurriculum,
  type TestAdmin,
  type TestTrainee,
} from './helpers/fixtures.js';
import { api, body, expectError } from './helpers/http.js';

const ENDPOINT = '/api/admin/trainees';
const NEW_TRAINEE = { name: 'Asha Rao', email: 'asha.rao@vonnue.com' };

let a: TestTrainee;
let admin: TestAdmin;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a } = await freshTrainees());
  admin = await createAdmin('Test Mentor');
});

const countTrainees = () => db.trainee.count();

describe('POST /api/admin/trainees', () => {
  it('creates the trainee and returns their list row (day 1, zeros)', async () => {
    const res = await api.post(ENDPOINT, NEW_TRAINEE, admin.cookie);

    expect(res.status).toBe(201);
    const created = body<AdminTraineeSummary>(res);
    expect(created).toMatchObject({
      name: 'Asha Rao',
      email: 'asha.rao@vonnue.com',
      daysCompleted: 0,
      totalDays: 3,
      currentDay: { id: DAY.html1, courseTitle: 'HTML', dayNumber: 1 },
      todayActiveSeconds: 0,
      totalActiveSeconds: 0,
      lastActiveDate: null,
      latestWpm: null,
      flagsLast7Days: 0,
    });

    const stored = await db.trainee.findUnique({ where: { email: 'asha.rao@vonnue.com' } });
    expect(stored?.id).toBe(created.id);
  });

  it('stores the email trimmed and lower-cased, and the name tidied', async () => {
    const res = await api.post(
      ENDPOINT,
      { name: '  Asha   Rao ', email: ' Asha.Rao@VONNUE.com ' },
      admin.cookie
    );

    expect(res.status).toBe(201);
    expect(body<AdminTraineeSummary>(res)).toMatchObject({
      name: 'Asha Rao',
      email: 'asha.rao@vonnue.com',
    });
  });

  it('shows the new trainee in GET /api/admin/trainees', async () => {
    const created = body<AdminTraineeSummary>(await api.post(ENDPOINT, NEW_TRAINEE, admin.cookie));

    const list = body<AdminTraineeSummary[]>(await api.get(ENDPOINT, admin.cookie));
    expect(list.find((t) => t.id === created.id)).toEqual(created);
  });

  it('gives a trainee who can use the platform straight away', async () => {
    const created = body<AdminTraineeSummary>(await api.post(ENDPOINT, NEW_TRAINEE, admin.cookie));
    const token = signJwt({
      id: created.id,
      name: created.name,
      email: created.email,
      role: 'trainee',
    });

    const res = await api.get('/api/dashboard', `${AUTH_COOKIE_NAME}=${token}`);
    expect(res.status).toBe(200);
  });

  it('ignores an id sent in the body', async () => {
    const forcedId = '00000000-0000-4000-8000-000000000000';
    const res = await api.post(ENDPOINT, { ...NEW_TRAINEE, id: forcedId }, admin.cookie);

    expect(res.status).toBe(201);
    expect(body<AdminTraineeSummary>(res).id).not.toBe(forcedId);
  });

  it('returns 409 TRAINEE_EXISTS for an existing trainee, in any letter case', async () => {
    const before = await countTrainees();

    const res = await api.post(
      ENDPOINT,
      { name: 'Copy', email: a.email.toUpperCase() },
      admin.cookie
    );

    expectError(res, 409, 'TRAINEE_EXISTS');
    expect(await countTrainees()).toBe(before);
  });

  it('returns 409 EMAIL_BELONGS_TO_ADMIN for an active or deactivated admin', async () => {
    const former = await createAdmin('Former Mentor', false);

    expectError(
      await api.post(ENDPOINT, { name: 'X Y', email: admin.email }, admin.cookie),
      409,
      'EMAIL_BELONGS_TO_ADMIN'
    );
    expectError(
      await api.post(ENDPOINT, { name: 'X Y', email: former.email }, admin.cookie),
      409,
      'EMAIL_BELONGS_TO_ADMIN'
    );
  });

  it('returns 400 DOMAIN_NOT_PERMITTED for another domain', async () => {
    const res = await api.post(
      ENDPOINT,
      { name: 'Asha Rao', email: 'asha@gmail.com' },
      admin.cookie
    );

    expectError(res, 400, 'DOMAIN_NOT_PERMITTED');
  });

  it.each([
    [{ email: 'asha.rao@vonnue.com' }],
    [{ name: 'A', email: 'asha.rao@vonnue.com' }],
    [{ name: 'x'.repeat(81), email: 'asha.rao@vonnue.com' }],
    [{ name: 'Asha Rao', email: 'not-an-email' }],
    [{}],
  ])('returns 400 VALIDATION_FAILED for %o', async (payload) => {
    expectError(await api.post(ENDPOINT, payload, admin.cookie), 400, 'VALIDATION_FAILED');
  });

  it('returns 403 to a trainee and creates nothing', async () => {
    const before = await countTrainees();

    expectError(await api.post(ENDPOINT, NEW_TRAINEE, a.cookie), 403, 'FORBIDDEN');
    expect(await countTrainees()).toBe(before);
  });

  it('returns 403 to a deactivated admin', async () => {
    const former = await createAdmin('Former Mentor', false);

    expectError(await api.post(ENDPOINT, NEW_TRAINEE, former.cookie), 403, 'FORBIDDEN');
  });

  it('returns 401 without a login cookie', async () => {
    expectError(await request(app).post(ENDPOINT).send(NEW_TRAINEE), 401, 'UNAUTHENTICATED');
  });
});
