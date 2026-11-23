import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../errors/AppError';

const repo = vi.hoisted(() => ({
  findCourse: vi.fn(),
  findTrainee: vi.fn(),
  findAllDays: vi.fn(),
  findCompletions: vi.fn(),
  findRequiredTaskProgress: vi.fn(),
  findCertificateByTraineeAndCourse: vi.fn(),
  findCertificateByCertificateId: vi.fn(),
  createCertificate: vi.fn(),
  revokeCertificate: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('./certificate.repository', () => ({
  CertificateRepository: class {
    findCourse = repo.findCourse;
    findTrainee = repo.findTrainee;
    findAllDays = repo.findAllDays;
    findCompletions = repo.findCompletions;
    findRequiredTaskProgress = repo.findRequiredTaskProgress;
    findCertificateByTraineeAndCourse = repo.findCertificateByTraineeAndCourse;
    findCertificateByCertificateId = repo.findCertificateByCertificateId;
    createCertificate = repo.createCertificate;
    revokeCertificate = repo.revokeCertificate;
  },
}));

import {
  CERTIFICATE_LOCKED_MESSAGE,
  CertificateService,
  summarizeCompletions,
} from './certificate.service';
import { verifyCertificatePayload } from './certificate-signature.util';

const traineeId = 'trainee-1';
const courseId = 'html';

const course = { id: courseId, title: 'HTML & Semantic Web' };
const trainee = { id: traineeId, name: 'Alex Morgan' };
const days = [
  { id: 'html-day-01', course_id: courseId },
  { id: 'html-day-02', course_id: courseId },
];
const completedDays = [
  { curriculum_day_id: 'html-day-01', completed_at: new Date('2026-11-10T10:00:00.000Z') },
  { curriculum_day_id: 'html-day-02', completed_at: new Date('2026-11-11T10:00:00.000Z') },
];
const requiredTasks = [
  { id: 'task-1', curriculum_day: { course_id: courseId }, progress: [{ review_status: 'approved' }] },
  { id: 'task-2', curriculum_day: { course_id: courseId }, progress: [{ review_status: 'approved' }] },
];

function makeRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cert-db-id',
    certificate_id: 'VK-AAAAAAAAAAAAAAAAAAAA',
    trainee_id: traineeId,
    course_id: courseId,
    trainee_name: 'Alex Morgan',
    course_title: 'HTML & Semantic Web',
    days_completed: 2,
    completed_at: new Date('2026-11-11T10:00:00.000Z'),
    issued_at: new Date('2026-11-12T10:00:00.000Z'),
    status: 'ACTIVE',
    revoked_at: null,
    signature: 'signed',
    signature_algorithm: 'Ed25519',
    signature_version: 'v1',
    ...overrides,
  };
}

describe('summarizeCompletions', () => {
  it('marks a course complete when every day is completed', () => {
    const result = summarizeCompletions(days, completedDays, requiredTasks);
    expect(result.get(courseId)?.complete).toBe(true);
    expect(result.get(courseId)?.dayCount).toBe(2);
  });

  it('marks a course incomplete when at least one day is incomplete', () => {
    const result = summarizeCompletions(days, [completedDays[0]], requiredTasks);
    expect(result.get(courseId)?.complete).toBe(false);
    expect(result.get(courseId)?.completedAt).toBeNull();
  });

  it('uses the latest completion date when all days are completed', () => {
    const result = summarizeCompletions(days, completedDays, requiredTasks);
    expect(result.get(courseId)?.completedAt).toEqual(new Date('2026-11-11T10:00:00.000Z'));
  });

  it.each(['pending', 'rework', null])(
    'does not consider a course eligible when a required task has review status %s',
    (reviewStatus) => {
      const tasks = [requiredTasks[0], { ...requiredTasks[1], progress: [{ review_status: reviewStatus }] }];
      const result = summarizeCompletions(days, completedDays, tasks);
      expect(result.get(courseId)?.allTasksApproved).toBe(false);
    }
  );

  it('does not consider a course eligible when it has no required tasks', () => {
    const result = summarizeCompletions(days, completedDays, []);
    expect(result.get(courseId)?.allTasksApproved).toBe(false);
  });
});

describe('CertificateService', () => {
  let service: CertificateService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CertificateService();
    repo.findCourse.mockResolvedValue(course);
    repo.findTrainee.mockResolvedValue(trainee);
    repo.findAllDays.mockResolvedValue(days);
    repo.findCompletions.mockResolvedValue(completedDays);
    repo.findRequiredTaskProgress.mockResolvedValue(requiredTasks);
    repo.findCertificateByTraineeAndCourse.mockResolvedValue(null);
    repo.findCertificateByCertificateId.mockResolvedValue(null);
    repo.revokeCertificate.mockImplementation(async (_id, revokedAt) =>
      makeRecord({ status: 'REVOKED', revoked_at: revokedAt })
    );
    prismaMock.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({})
    );
    repo.createCertificate.mockImplementation(async (data) => makeRecord(data));
  });

  it('returns a persisted certificate when eligible', async () => {
    const result = await service.getCourseCertificate(traineeId, courseId);
    expect(result.courseId).toBe(courseId);
    expect(result.courseTitle).toBe(course.title);
    expect(result.traineeName).toBe(trainee.name);
    expect(result.daysCompleted).toBe(2);
    expect(result.completedAt).toBe('2026-11-11T10:00:00.000Z');
    expect(result.status).toBe('ACTIVE');
    expect(result.certificateId).toMatch(/^VK-[A-F0-9]{20}$/);
    expect(result.signature).toEqual(expect.any(String));
    expect(repo.createCertificate).toHaveBeenCalledTimes(1);
  });

  it('returns the existing certificate instead of issuing a duplicate', async () => {
    repo.findCertificateByTraineeAndCourse.mockResolvedValue(makeRecord());
    const result = await service.getCourseCertificate(traineeId, courseId);
    expect(result.certificateId).toBe('VK-AAAAAAAAAAAAAAAAAAAA');
    expect(repo.createCertificate).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the course does not exist', async () => {
    repo.findCourse.mockResolvedValue(null);
    await expect(service.getCourseCertificate(traineeId, courseId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ForbiddenError when a required task is not approved', async () => {
    repo.findRequiredTaskProgress.mockResolvedValue([
      requiredTasks[0],
      { ...requiredTasks[1], progress: [{ review_status: 'rework' }] },
    ]);
    await expect(service.getCourseCertificate(traineeId, courseId)).rejects.toThrow(CERTIFICATE_LOCKED_MESSAGE);
  });

  it('throws ForbiddenError when days are incomplete', async () => {
    repo.findCompletions.mockResolvedValue([completedDays[0]]);
    await expect(service.getCourseCertificate(traineeId, courseId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('verifies a valid active certificate', async () => {
    const issued = await service.getCourseCertificate(traineeId, courseId);
    repo.findCertificateByCertificateId.mockResolvedValue(
      makeRecord({
        certificate_id: issued.certificateId,
        signature: issued.signature,
        issued_at: new Date(issued.issuedAt),
        completed_at: new Date(issued.completedAt),
      })
    );

    const result = await service.verifyCertificate(issued.certificateId);
    expect(result.valid).toBe(true);
    expect(result.signatureValid).toBe(true);
    expect(result.status).toBe('ACTIVE');
  });

  it('fails verification when protected data is modified', async () => {
    const issued = await service.getCourseCertificate(traineeId, courseId);
    repo.findCertificateByCertificateId.mockResolvedValue(
      makeRecord({
        certificate_id: issued.certificateId,
        signature: issued.signature,
        trainee_name: 'Tampered Name',
        issued_at: new Date(issued.issuedAt),
        completed_at: new Date(issued.completedAt),
      })
    );

    const result = await service.verifyCertificate(issued.certificateId);
    expect(result.valid).toBe(false);
    expect(result.signatureValid).toBe(false);
  });

  it('returns revoked status for revoked certificates', async () => {
    const issued = await service.getCourseCertificate(traineeId, courseId);
    repo.findCertificateByCertificateId.mockResolvedValue(
      makeRecord({
        certificate_id: issued.certificateId,
        signature: issued.signature,
        issued_at: new Date(issued.issuedAt),
        completed_at: new Date(issued.completedAt),
        status: 'REVOKED',
        revoked_at: new Date('2026-11-13T10:00:00.000Z'),
      })
    );

    const result = await service.verifyCertificate(issued.certificateId);
    expect(result.valid).toBe(false);
    expect(result.signatureValid).toBe(true);
    expect(result.status).toBe('REVOKED');
  });

  it('returns unknown for missing certificate IDs', async () => {
    const result = await service.verifyCertificate('VK-FFFFFFFFFFFFFFFFFFFF');
    expect(result.valid).toBe(false);
    expect(result.status).toBe('UNKNOWN');
  });

  it('revokes an active certificate', async () => {
    repo.findCertificateByCertificateId.mockResolvedValue(makeRecord());
    const result = await service.revokeCertificate('VK-AAAAAAAAAAAAAAAAAAAA');
    expect(result.status).toBe('REVOKED');
    expect(repo.revokeCertificate).toHaveBeenCalled();
  });

  it('handles concurrent issuance conflicts by returning the existing certificate', async () => {
    repo.createCertificate.mockRejectedValueOnce({ code: 'P2002' });
    repo.findCertificateByTraineeAndCourse
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeRecord({ certificate_id: 'VK-BBBBBBBBBBBBBBBBBBBB' }));

    const result = await service.getCourseCertificate(traineeId, courseId);
    expect(result.certificateId).toBe('VK-BBBBBBBBBBBBBBBBBBBB');
  });

  it('fails safely when signing configuration is missing', async () => {
    const { env } = await import('../../config/env');
    const { resetCertificateSigningKeysForTests } = await import('./certificate-signature.util');
    const original = env.CERTIFICATE_SIGNING_PRIVATE_KEY;
    (env as { CERTIFICATE_SIGNING_PRIVATE_KEY?: string }).CERTIFICATE_SIGNING_PRIVATE_KEY = undefined;
    resetCertificateSigningKeysForTests();

    await expect(service.getCourseCertificate(traineeId, courseId)).rejects.toMatchObject({
      statusCode: 500,
    });

    (env as { CERTIFICATE_SIGNING_PRIVATE_KEY?: string }).CERTIFICATE_SIGNING_PRIVATE_KEY = original;
    resetCertificateSigningKeysForTests();
  });
});
