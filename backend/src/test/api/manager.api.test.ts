import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { ManagerStaffMember, ManagerTrainee, MeResponse } from '@itp/types';
import app from '../../app';
import { db } from './helpers/db';
import {
  DAY,
  TASK,
  assignTrainees,
  createAdmin,
  createManager,
  freshTrainees,
  seedCurriculum,
  type TestAdmin,
  type TestTrainee,
} from './helpers/fixtures';
import { api, body, expectError } from './helpers/http';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

let a: TestTrainee;
let b: TestTrainee;
let manager: TestAdmin;
let mentor1: TestAdmin;
let mentor2: TestAdmin;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
  manager = await createManager('Account Manager');
  mentor1 = await createAdmin('Mentor One');
  mentor2 = await createAdmin('Mentor Two');
});

const assign = (traineeId: string, mentorId: string | null) =>
  api.patch(`/api/manager/trainees/${traineeId}/mentor`, { mentorId }, manager.cookie);

const listTrainees = async (): Promise<ManagerTrainee[]> => {
  const res = await api.get('/api/manager/trainees', manager.cookie);
  expect(res.status).toBe(200);
  return body<ManagerTrainee[]>(res);
};

function traineeRow(rows: ManagerTrainee[], trainee: TestTrainee): ManagerTrainee {
  const row = rows.find((item) => item.id === trainee.id);
  expect(row).toBeDefined();
  return row as ManagerTrainee;
}

describe('manager API role guards', () => {
  it('lets an active manager list staff and trainees', async () => {
    expect((await api.get('/api/manager/staff', manager.cookie)).status).toBe(200);
    expect((await api.get('/api/manager/trainees', manager.cookie)).status).toBe(200);
  });

  it('returns the manager role from /api/auth/me', async () => {
    const res = await api.get('/api/auth/me', manager.cookie);
    expect(res.status).toBe(200);
    expect(body<MeResponse>(res).role).toBe('manager');
  });

  it.each([
    ['mentor', () => mentor1.cookie],
    ['trainee', () => a.cookie],
  ])('refuses a %s', async (_label, cookie) => {
    expectError(await api.get('/api/manager/staff', cookie()), 403, 'FORBIDDEN');
    expectError(await api.get('/api/manager/trainees', cookie()), 403, 'FORBIDDEN');
  });

  it('refuses a deactivated manager even with a valid cookie', async () => {
    await db.admin.update({ where: { id: manager.id }, data: { is_active: false } });

    expectError(await api.get('/api/manager/staff', manager.cookie), 403, 'FORBIDDEN');
  });

  it('returns 401 without a cookie', async () => {
    expectError(await request(app).get('/api/manager/staff'), 401, 'UNAUTHENTICATED');
  });

  it('does not let a manager into the mentor-only /api/admin routes', async () => {
    expectError(await api.get('/api/admin/trainees', manager.cookie), 403, 'FORBIDDEN');
  });
});

describe('GET /api/manager/staff', () => {
  it('lists mentors and managers with role, status and assignment counts', async () => {
    await assignTrainees(mentor1, a);

    const res = await api.get('/api/manager/staff', manager.cookie);
    const rows = body<ManagerStaffMember[]>(res);
    const mentorRow = rows.find((row) => row.id === mentor1.id);
    const managerRow = rows.find((row) => row.id === manager.id);

    expect(mentorRow).toMatchObject({
      role: 'mentor',
      isActive: true,
      assignedTraineeCount: 1,
      email: mentor1.email,
    });
    expect(managerRow).toMatchObject({ role: 'manager', isActive: true });
  });
});

describe('GET /api/manager/trainees', () => {
  it('shows unassigned and assigned trainees with their current mentor', async () => {
    await assignTrainees(mentor1, a);

    const rows = await listTrainees();

    expect(traineeRow(rows, a)).toEqual({
      id: a.id,
      name: a.name,
      email: a.email,
      isActive: true,
      mentor: { id: mentor1.id, name: mentor1.name, email: mentor1.email },
    });
    expect(traineeRow(rows, b).mentor).toBeNull();
  });
});

describe('POST /api/manager/staff', () => {
  it('creates a mentor account', async () => {
    const res = await api.post(
      '/api/manager/staff',
      { name: '  New   Mentor ', email: 'New.Mentor@VONNUE.com', role: 'mentor' },
      manager.cookie
    );

    expect(res.status).toBe(201);
    expect(body<ManagerStaffMember>(res)).toMatchObject({
      name: 'New Mentor',
      email: 'new.mentor@vonnue.com',
      role: 'mentor',
      isActive: true,
      assignedTraineeCount: 0,
    });
    const stored = await db.admin.findUnique({ where: { email: 'new.mentor@vonnue.com' } });
    expect(stored).toMatchObject({ role: 'MENTOR', is_active: true });
  });

  it('creates a manager account', async () => {
    const res = await api.post(
      '/api/manager/staff',
      { name: 'Second Manager', email: 'second.manager@vonnue.com', role: 'manager' },
      manager.cookie
    );

    expect(res.status).toBe(201);
    expect(body<ManagerStaffMember>(res).role).toBe('manager');
    expect(
      (await db.admin.findUnique({ where: { email: 'second.manager@vonnue.com' } }))?.role
    ).toBe('MANAGER');
  });

  it('rejects a duplicate staff email with 409 STAFF_EXISTS', async () => {
    expectError(
      await api.post(
        '/api/manager/staff',
        { name: 'Copy', email: mentor1.email, role: 'mentor' },
        manager.cookie
      ),
      409,
      'STAFF_EXISTS'
    );
  });

  it('rejects a trainee email with 409 TRAINEE_EXISTS', async () => {
    expectError(
      await api.post(
        '/api/manager/staff',
        { name: 'Copy', email: a.email, role: 'mentor' },
        manager.cookie
      ),
      409,
      'TRAINEE_EXISTS'
    );
  });

  it.each([
    [{ name: 'A', email: 'new@vonnue.com', role: 'mentor' }],
    [{ name: 'Valid Name', email: 'new@vonnue.com', role: 'trainee' }],
    [{ name: 'Valid Name', email: 'not-an-email', role: 'mentor' }],
    [{}],
  ])('rejects invalid input %o', async (payload) => {
    expectError(
      await api.post('/api/manager/staff', payload, manager.cookie),
      400,
      'VALIDATION_FAILED'
    );
  });

  it('rejects an email outside the company domain', async () => {
    expectError(
      await api.post(
        '/api/manager/staff',
        { name: 'Valid Name', email: 'new@gmail.com', role: 'mentor' },
        manager.cookie
      ),
      400,
      'DOMAIN_NOT_PERMITTED'
    );
  });
});

describe('PATCH /api/manager/staff/:staffId', () => {
  it('updates name and email', async () => {
    const res = await api.patch(
      `/api/manager/staff/${mentor2.id}`,
      { name: 'Renamed Mentor', email: 'renamed.mentor@vonnue.com' },
      manager.cookie
    );

    expect(res.status).toBe(200);
    expect(body<ManagerStaffMember>(res)).toMatchObject({
      name: 'Renamed Mentor',
      email: 'renamed.mentor@vonnue.com',
      role: 'mentor',
    });
  });

  it('rejects an empty update', async () => {
    expectError(
      await api.patch(`/api/manager/staff/${mentor2.id}`, {}, manager.cookie),
      400,
      'VALIDATION_FAILED'
    );
  });

  it('returns 404 for an unknown account', async () => {
    expectError(
      await api.patch(`/api/manager/staff/${UNKNOWN_ID}`, { name: 'Renamed' }, manager.cookie),
      404,
      'NOT_FOUND'
    );
  });

  it('does not let a manager change their own role', async () => {
    expectError(
      await api.patch(`/api/manager/staff/${manager.id}`, { role: 'mentor' }, manager.cookie),
      403,
      'FORBIDDEN'
    );
  });

  it('refuses to promote a mentor who still has assigned trainees', async () => {
    await assignTrainees(mentor1, a);

    expectError(
      await api.patch(`/api/manager/staff/${mentor1.id}`, { role: 'manager' }, manager.cookie),
      409,
      'STAFF_HAS_TRAINEES'
    );
  });
});

describe('PATCH /api/manager/staff/:staffId/status', () => {
  it('deactivates and reactivates a mentor without assignments', async () => {
    const off = await api.patch(
      `/api/manager/staff/${mentor1.id}/status`,
      { isActive: false },
      manager.cookie
    );
    expect(off.status).toBe(200);
    expect(body<ManagerStaffMember>(off).isActive).toBe(false);

    const on = await api.patch(
      `/api/manager/staff/${mentor1.id}/status`,
      { isActive: true },
      manager.cookie
    );
    expect(on.status).toBe(200);
    expect(body<ManagerStaffMember>(on).isActive).toBe(true);
  });

  it('does not let a manager deactivate themselves', async () => {
    expectError(
      await api.patch(
        `/api/manager/staff/${manager.id}/status`,
        { isActive: false },
        manager.cookie
      ),
      403,
      'FORBIDDEN'
    );
  });

  it('refuses to deactivate a mentor with assigned trainees', async () => {
    await assignTrainees(mentor1, a);

    expectError(
      await api.patch(
        `/api/manager/staff/${mentor1.id}/status`,
        { isActive: false },
        manager.cookie
      ),
      409,
      'STAFF_HAS_TRAINEES'
    );
  });

  it('immediately blocks a deactivated mentor from the mentor routes', async () => {
    await api.patch(`/api/manager/staff/${mentor1.id}/status`, { isActive: false }, manager.cookie);

    expectError(await api.get('/api/admin/trainees', mentor1.cookie), 403, 'FORBIDDEN');
  });
});

describe('trainee account management', () => {
  it('creates an unassigned trainee', async () => {
    const res = await api.post(
      '/api/manager/trainees',
      { name: '  New   Trainee ', email: 'New.Trainee@VONNUE.com' },
      manager.cookie
    );

    expect(res.status).toBe(201);
    expect(body<ManagerTrainee>(res)).toMatchObject({
      name: 'New Trainee',
      email: 'new.trainee@vonnue.com',
      isActive: true,
      mentor: null,
    });
  });

  it('creates a trainee assigned to an active mentor', async () => {
    const res = await api.post(
      '/api/manager/trainees',
      { name: 'Assigned Trainee', email: 'assigned@vonnue.com', mentorId: mentor2.id },
      manager.cookie
    );

    expect(res.status).toBe(201);
    expect(body<ManagerTrainee>(res).mentor).toEqual({
      id: mentor2.id,
      name: mentor2.name,
      email: mentor2.email,
    });
  });

  it('rejects a manager as a mentor', async () => {
    expectError(
      await api.post(
        '/api/manager/trainees',
        { name: 'Bad Mentor Trainee', email: 'bad.mentor@vonnue.com', mentorId: manager.id },
        manager.cookie
      ),
      400,
      'INVALID_MENTOR'
    );
  });

  it('rejects an inactive mentor', async () => {
    await db.admin.update({ where: { id: mentor2.id }, data: { is_active: false } });

    expectError(
      await api.post(
        '/api/manager/trainees',
        { name: 'Bad Mentor Trainee', email: 'bad.mentor@vonnue.com', mentorId: mentor2.id },
        manager.cookie
      ),
      400,
      'INVALID_MENTOR'
    );
  });

  it('rejects duplicate trainee emails and staff emails', async () => {
    expectError(
      await api.post('/api/manager/trainees', { name: 'Copy', email: a.email }, manager.cookie),
      409,
      'TRAINEE_EXISTS'
    );
    expectError(
      await api.post(
        '/api/manager/trainees',
        { name: 'Copy', email: mentor1.email },
        manager.cookie
      ),
      409,
      'EMAIL_BELONGS_TO_ADMIN'
    );
  });

  it('updates a trainee name and email', async () => {
    const res = await api.patch(
      `/api/manager/trainees/${a.id}`,
      { name: 'Renamed Trainee', email: 'renamed.trainee@vonnue.com' },
      manager.cookie
    );

    expect(res.status).toBe(200);
    expect(body<ManagerTrainee>(res)).toMatchObject({
      name: 'Renamed Trainee',
      email: 'renamed.trainee@vonnue.com',
    });
  });

  it('deactivates a trainee and blocks their requests immediately', async () => {
    expect((await api.get('/api/dashboard', a.cookie)).status).toBe(200);

    const off = await api.patch(
      `/api/manager/trainees/${a.id}/status`,
      { isActive: false },
      manager.cookie
    );
    expect(off.status).toBe(200);
    expect(body<ManagerTrainee>(off).isActive).toBe(false);

    expectError(await api.get('/api/dashboard', a.cookie), 403, 'FORBIDDEN');

    await api.patch(`/api/manager/trainees/${a.id}/status`, { isActive: true }, manager.cookie);
    expect((await api.get('/api/dashboard', a.cookie)).status).toBe(200);
  });
});

describe('mentor assignment lifecycle', () => {
  it('assigns, rejects a duplicate, reassigns, and unassigns', async () => {
    expect(traineeRow(await listTrainees(), a).mentor).toBeNull();

    const assigned = await assign(a.id, mentor1.id);
    expect(assigned.status).toBe(200);
    expect(body<ManagerTrainee>(assigned).mentor?.id).toBe(mentor1.id);
    expect(traineeRow(await listTrainees(), a).mentor?.id).toBe(mentor1.id);

    expectError(await assign(a.id, mentor1.id), 409, 'ALREADY_ASSIGNED');

    const reassigned = await assign(a.id, mentor2.id);
    expect(reassigned.status).toBe(200);
    expect(body<ManagerTrainee>(reassigned).mentor?.id).toBe(mentor2.id);

    const unassigned = await assign(a.id, null);
    expect(unassigned.status).toBe(200);
    expect(body<ManagerTrainee>(unassigned).mentor).toBeNull();
    expect(traineeRow(await listTrainees(), a).mentor).toBeNull();
  });

  it('treats a repeated unassign as a no-op', async () => {
    expect((await assign(a.id, null)).status).toBe(200);
    expect((await assign(a.id, null)).status).toBe(200);
  });

  it('applies a reassignment to mentor access on the next request', async () => {
    await assign(a.id, mentor1.id);

    expect((await api.get(`/api/admin/trainees/${a.id}`, mentor1.cookie)).status).toBe(200);
    expectError(await api.get(`/api/admin/trainees/${a.id}`, mentor2.cookie), 403, 'FORBIDDEN');

    await assign(a.id, mentor2.id);

    expectError(await api.get(`/api/admin/trainees/${a.id}`, mentor1.cookie), 403, 'FORBIDDEN');
    expect((await api.get(`/api/admin/trainees/${a.id}`, mentor2.cookie)).status).toBe(200);

    const m1List = body<{ id: string }[]>(await api.get('/api/admin/trainees', mentor1.cookie));
    const m2List = body<{ id: string }[]>(await api.get('/api/admin/trainees', mentor2.cookie));
    expect(m1List.map((row) => row.id)).not.toContain(a.id);
    expect(m2List.map((row) => row.id)).toContain(a.id);
  });

  it('unassignment closes detail, flags, task code, and review endpoints', async () => {
    await assign(a.id, mentor1.id);
    expect((await api.get(`/api/admin/trainees/${a.id}`, mentor1.cookie)).status).toBe(200);
    expect((await api.get(`/api/admin/trainees/${a.id}/flags`, mentor1.cookie)).status).toBe(200);
    expect(
      (await api.get(`/api/admin/trainees/${a.id}/tasks/${TASK.html1Main}/code`, mentor1.cookie))
        .status
    ).toBe(200);

    await assign(a.id, null);

    for (const path of [
      `/api/admin/trainees/${a.id}`,
      `/api/admin/trainees/${a.id}/flags`,
      `/api/admin/trainees/${a.id}/tasks/${TASK.html1Main}/code`,
      `/api/admin/trainees/${a.id}/tasks/${TASK.html1Main}/reviews`,
      `/api/admin/trainees/${a.id}/feedback`,
    ]) {
      expectError(await api.get(path, mentor1.cookie), 403, 'FORBIDDEN');
    }
    expectError(
      await api.post(
        `/api/admin/trainees/${a.id}/tasks/${TASK.html1Main}/approve`,
        {},
        mentor1.cookie
      ),
      403,
      'FORBIDDEN'
    );
  });

  it('rejects unknown trainees and invalid mentor targets', async () => {
    expectError(await assign(UNKNOWN_ID, mentor1.id), 404, 'NOT_FOUND');
    expectError(await assign(a.id, UNKNOWN_ID), 404, 'NOT_FOUND');
    expectError(await assign(a.id, manager.id), 400, 'INVALID_MENTOR');

    await db.admin.update({ where: { id: mentor2.id }, data: { is_active: false } });
    expectError(await assign(a.id, mentor2.id), 400, 'INVALID_MENTOR');
  });

  it('does not change trainee data when the assignment is invalid', async () => {
    await assignTrainees(mentor1, a);

    await assign(a.id, manager.id);

    expect((await db.trainee.findUnique({ where: { id: a.id } }))?.mentor_id).toBe(mentor1.id);
  });
});

describe('trainee data is untouched by account changes', () => {
  it('deactivation keeps records and the assignment intact', async () => {
    await assignTrainees(mentor1, a);
    await db.task_progress.create({
      data: {
        trainee_id: a.id,
        task_id: TASK.html1Main,
        status: 'completed',
      },
    });

    await api.patch(`/api/manager/trainees/${a.id}/status`, { isActive: false }, manager.cookie);

    const trainee = await db.trainee.findUnique({ where: { id: a.id } });
    expect(trainee).toMatchObject({ is_active: false, mentor_id: mentor1.id });
    expect(
      await db.task_progress.count({ where: { trainee_id: a.id, task_id: TASK.html1Main } })
    ).toBe(1);
    expect(
      body<ManagerTrainee[]>(await api.get('/api/manager/trainees', manager.cookie)).find(
        (row) => row.id === a.id
      )?.isActive
    ).toBe(false);
  });

  it('a deactivated trainee stays visible to the assigned mentor', async () => {
    await assignTrainees(mentor1, a);
    await api.patch(`/api/manager/trainees/${a.id}/status`, { isActive: false }, manager.cookie);

    // The assignment is still valid, so the mentor can open historical records.
    expect((await api.get(`/api/admin/trainees/${a.id}`, mentor1.cookie)).status).toBe(200);
  });

  it('does not expose an unassigned trainee through the day grid used by the list', async () => {
    const list = await api.get('/api/admin/trainees', mentor1.cookie);
    expect(body<{ id: string }[]>(list).map((row) => row.id)).not.toContain(a.id);
  });

  it('keeps the health endpoint and trainee login for the trainee', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await api.get(`/api/days/${DAY.html1}`, a.cookie)).status).toBe(200);
  });
});
