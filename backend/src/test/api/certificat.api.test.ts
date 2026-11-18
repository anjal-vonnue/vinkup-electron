import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CourseCertificate, DashboardResponse, ApiErrorResponse } from '@itp/types';
import { db } from './helpers/db.js';
import {
  DAY,
  freshTrainees,
  markDayCompleted,
  seedCurriculum,
  type TestTrainee,
} from './helpers/fixtures.js';
import { api, body, expectError, expectIsoDateTime } from './helpers/http.js';
import { buildCertificateId } from '../../module/dashboard-module/certificate.util.js';

let a: TestTrainee;
let b: TestTrainee;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
});

describe('GET /api/courses/:courseId/certificate', () => {
  it('returns 404 NOT_FOUND for an unknown course', async () => {
    expectError(await api.get('/api/courses/cobol/certificate', a.cookie), 404, 'NOT_FOUND');
  });

  it('returns 403 FORBIDDEN while any day is missing', async () => {
    await markDayCompleted(a.id, DAY.html1);
    const res = await api.get('/api/courses/html/certificate', a.cookie);
    expectError(res, 403, 'FORBIDDEN');
    expect(body<ApiErrorResponse>(res).error.message).toBe(
      'Finish every day of this course to get its certificate.'
    );
  });

  it("is not unlocked by another trainee's progress", async () => {
    await markDayCompleted(b.id, DAY.html1);
    await markDayCompleted(b.id, DAY.html2);
    expectError(await api.get('/api/courses/html/certificate', a.cookie), 403, 'FORBIDDEN');
  });

  it('returns the certificate with the latest completion date and a stable id', async () => {
    await db.day_completion.create({
      data: {
        trainee_id: a.id,
        curriculum_day_id: DAY.html1,
        completed_at: new Date('2026-10-05T10:00:00Z'),
      },
    });
    await db.day_completion.create({
      data: {
        trainee_id: a.id,
        curriculum_day_id: DAY.html2,
        completed_at: new Date('2026-10-06T09:00:00Z'),
      },
    });

    const first = body<CourseCertificate>(await api.get('/api/courses/html/certificate', a.cookie));
    const second = body<CourseCertificate>(
      await api.get('/api/courses/html/certificate', a.cookie)
    );

    expect(first).toEqual({
      courseId: 'html',
      courseTitle: 'HTML',
      traineeName: 'Trainee A',
      daysCompleted: 2,
      completedAt: '2026-10-06T09:00:00.000Z',
      certificateId: buildCertificateId(a.id, 'html'),
    });
    expect(first.certificateId).toMatch(/^VK-[0-9A-F]{10}$/);
    expectIsoDateTime(first.completedAt);
    expect(second).toEqual(first);
  });

  it('gives different trainees different ids', () => {
    expect(buildCertificateId(a.id, 'html')).not.toBe(buildCertificateId(b.id, 'html'));
  });
});

describe('GET /api/dashboard completedCourseIds', () => {
  it('lists only fully completed courses', async () => {
    await markDayCompleted(a.id, DAY.html1);
    let dashboard = body<DashboardResponse>(await api.get('/api/dashboard', a.cookie));
    expect(dashboard.completedCourseIds).toEqual([]);

    await markDayCompleted(a.id, DAY.html2);
    dashboard = body<DashboardResponse>(await api.get('/api/dashboard', a.cookie));
    expect(dashboard.completedCourseIds).toEqual(['html']);
  });
});
