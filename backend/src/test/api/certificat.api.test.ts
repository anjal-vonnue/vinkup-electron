import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CertificateVerificationResponse, CourseCertificate, DashboardResponse } from '@itp/types';
import { db } from './helpers/db';
import {
  DAY,
  TASK,
  createAdmin,
  createManager,
  freshTrainees,
  markDayCompleted,
  seedCurriculum,
  type TestTrainee,
} from './helpers/fixtures';
import { api, body, expectError, expectIsoDateTime } from './helpers/http';

let a: TestTrainee;
let b: TestTrainee;

beforeAll(async () => {
  await seedCurriculum();
});

beforeEach(async () => {
  ({ a, b } = await freshTrainees());
});

async function approveRequiredHtmlTasks(traineeId: string) {
  const now = new Date();
  for (const taskId of [TASK.html1Main, TASK.html2First, TASK.html2Second]) {
    await db.task_progress.upsert({
      where: { trainee_id_task_id: { trainee_id: traineeId, task_id: taskId } },
      update: { status: 'completed', review_status: 'approved', last_submitted_at: now },
      create: {
        trainee_id: traineeId,
        task_id: taskId,
        status: 'completed',
        review_status: 'approved',
        submission_count: 1,
        first_submitted_at: now,
        last_submitted_at: now,
      },
    });
  }
}

async function completeHtmlCourse(traineeId: string) {
  await markDayCompleted(traineeId, DAY.html1);
  await markDayCompleted(traineeId, DAY.html2);
  await approveRequiredHtmlTasks(traineeId);
}

describe('GET /api/courses/:courseId/certificate', () => {
  it('returns 404 NOT_FOUND for an unknown course', async () => {
    expectError(await api.get('/api/courses/cobol/certificate', a.cookie), 404, 'NOT_FOUND');
  });

  it('returns 403 FORBIDDEN while any day is missing', async () => {
    await markDayCompleted(a.id, DAY.html1);
    await approveRequiredHtmlTasks(a.id);
    const res = await api.get('/api/courses/html/certificate', a.cookie);
    expectError(res, 403, 'FORBIDDEN');
  });

  it('returns 403 FORBIDDEN when required tasks are not approved', async () => {
    await markDayCompleted(a.id, DAY.html1);
    await markDayCompleted(a.id, DAY.html2);
    expectError(await api.get('/api/courses/html/certificate', a.cookie), 403, 'FORBIDDEN');
  });

  it("is not unlocked by another trainee's progress", async () => {
    await completeHtmlCourse(b.id);
    expectError(await api.get('/api/courses/html/certificate', a.cookie), 403, 'FORBIDDEN');
  });

  it('issues and returns the same certificate on repeated requests', async () => {
    await db.day_completion.create({
      data: { trainee_id: a.id, curriculum_day_id: DAY.html1, completed_at: new Date('2026-10-05T10:00:00Z') },
    });
    await db.day_completion.create({
      data: { trainee_id: a.id, curriculum_day_id: DAY.html2, completed_at: new Date('2026-10-06T09:00:00Z') },
    });
    await approveRequiredHtmlTasks(a.id);

    const first = body<CourseCertificate>(await api.get('/api/courses/html/certificate', a.cookie));
    const second = body<CourseCertificate>(await api.get('/api/courses/html/certificate', a.cookie));

    expect(first.certificateId).toMatch(/^VK-[A-F0-9]{20}$/);
    expect(first.courseId).toBe('html');
    expect(first.courseTitle).toBe('HTML');
    expect(first.traineeName).toBe('Trainee A');
    expect(first.daysCompleted).toBe(2);
    expect(first.completedAt).toBe('2026-10-06T09:00:00.000Z');
    expectIsoDateTime(first.issuedAt);
    expect(first.status).toBe('ACTIVE');
    expect(first.signatureAlgorithm).toBe('Ed25519');
    expect(first.signatureVersion).toBe('v1');
    expect(first.signature).toEqual(expect.any(String));
    expect(second).toEqual(first);

    const count = await db.certificate.count({ where: { trainee_id: a.id, course_id: 'html' } });
    expect(count).toBe(1);
  });
});

describe('GET /api/certificates/verify/:certificateId', () => {
  it('returns a valid response for an active certificate', async () => {
    await completeHtmlCourse(a.id);
    const cert = body<CourseCertificate>(await api.get('/api/courses/html/certificate', a.cookie));

    const res = await api.get(`/api/certificates/verify/${cert.certificateId}`);
    expect(res.status).toBe(200);
    const result = body<CertificateVerificationResponse>(res);
    expect(result.valid).toBe(true);
    expect(result.signatureValid).toBe(true);
    expect(result.status).toBe('ACTIVE');
    expect(result.certificateId).toBe(cert.certificateId);
    expect(result.traineeName).toBe('Trainee A');
    expect(result.courseTitle).toBe('HTML');
    expect(result.completedAt).toBe(cert.completedAt);
    expect(result.issuedAt).toBe(cert.issuedAt);
    expect(JSON.stringify(result)).not.toContain(a.email);
    expect(JSON.stringify(result)).not.toContain(a.id);
  });

  it('returns UNKNOWN for an invalid certificate ID', async () => {
    const res = await api.get('/api/certificates/verify/VK-FFFFFFFFFFFFFFFFFFFF');
    expect(res.status).toBe(200);
    const result = body<CertificateVerificationResponse>(res);
    expect(result.valid).toBe(false);
    expect(result.signatureValid).toBe(false);
    expect(result.status).toBe('UNKNOWN');
  });

  it('returns invalid signature when protected data is modified', async () => {
    await completeHtmlCourse(a.id);
    const cert = body<CourseCertificate>(await api.get('/api/courses/html/certificate', a.cookie));

    await db.certificate.update({
      where: { certificate_id: cert.certificateId },
      data: { trainee_name: 'Tampered Name' },
    });

    const res = await api.get(`/api/certificates/verify/${cert.certificateId}`);
    const result = body<CertificateVerificationResponse>(res);
    expect(result.valid).toBe(false);
    expect(result.signatureValid).toBe(false);
    expect(result.status).toBe('ACTIVE');
  });

  it('returns revoked status for revoked certificates', async () => {
    await completeHtmlCourse(a.id);
    const cert = body<CourseCertificate>(await api.get('/api/courses/html/certificate', a.cookie));

    await db.certificate.update({
      where: { certificate_id: cert.certificateId },
      data: { status: 'REVOKED', revoked_at: new Date() },
    });

    const res = await api.get(`/api/certificates/verify/${cert.certificateId}`);
    const result = body<CertificateVerificationResponse>(res);
    expect(result.valid).toBe(false);
    expect(result.signatureValid).toBe(true);
    expect(result.status).toBe('REVOKED');
  });
});

describe('GET /api/dashboard completedCourseIds', () => {
  it('lists only fully completed and approved courses', async () => {
    await markDayCompleted(a.id, DAY.html1);
    await markDayCompleted(a.id, DAY.html2);
    let dashboard = body<DashboardResponse>(await api.get('/api/dashboard', a.cookie));
    expect(dashboard.completedCourseIds).toEqual([]);

    await approveRequiredHtmlTasks(a.id);
    dashboard = body<DashboardResponse>(await api.get('/api/dashboard', a.cookie));
    expect(dashboard.completedCourseIds).toEqual(['html']);
  });
});

describe('POST /api/certificates/:certificateId/revoke', () => {
  it('allows an authorized mentor to revoke a certificate', async () => {
    await completeHtmlCourse(a.id);
    const cert = body<CourseCertificate>(await api.get('/api/courses/html/certificate', a.cookie));
    const mentor = await createAdmin('Mentor Revoker');

    const res = await api.post(`/api/certificates/${cert.certificateId}/revoke`, {}, mentor.cookie);
    expect(res.status).toBe(200);
    expect(body<CourseCertificate>(res).status).toBe('REVOKED');

    const verify = body<CertificateVerificationResponse>(
      await api.get(`/api/certificates/verify/${cert.certificateId}`)
    );
    expect(verify.valid).toBe(false);
    expect(verify.status).toBe('REVOKED');
  });

  it('rejects revocation by trainees', async () => {
    await completeHtmlCourse(a.id);
    const cert = body<CourseCertificate>(await api.get('/api/courses/html/certificate', a.cookie));

    expectError(
      await api.post(`/api/certificates/${cert.certificateId}/revoke`, {}, a.cookie),
      403,
      'FORBIDDEN'
    );
  });

  it('allows a manager to revoke a certificate', async () => {
    await completeHtmlCourse(a.id);
    const cert = body<CourseCertificate>(await api.get('/api/courses/html/certificate', a.cookie));
    const manager = await createManager('Manager Revoker');

    const res = await api.post(`/api/certificates/${cert.certificateId}/revoke`, {}, manager.cookie);
    expect(res.status).toBe(200);
    expect(body<CourseCertificate>(res).status).toBe('REVOKED');
  });
});
