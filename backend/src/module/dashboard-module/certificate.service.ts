import type { CertificateVerificationResponse, CourseCertificate } from '@itp/types';
import { ForbiddenError, NotFoundError } from '../../errors/AppError';
import { prisma } from '../../lib/prisma';
import { CertificateRepository } from './certificate.repository';
import {
  CERTIFICATE_SIGNATURE_ALGORITHM,
  CERTIFICATE_SIGNATURE_VERSION,
  signCertificatePayload,
  verifyCertificatePayload,
} from './certificate-signature.util';
import { generateCertificateId } from './certificate.util';

const certificateRepository = new CertificateRepository();

export const CERTIFICATE_LOCKED_MESSAGE =
  'Complete every day and get all required tasks approved to earn this certificate.';

export type CourseCompletion = {
  dayCount: number;
  complete: boolean;
  completedAt: Date | null;
  requiredTaskCount: number;
  approvedTaskCount: number;
  allTasksApproved: boolean;
};

type RequiredTaskProgress = {
  id: string;
  curriculum_day: {
    course_id: string;
  };
  progress: {
    review_status: string | null;
  }[];
};

type CertificateRecord = {
  certificate_id: string;
  trainee_id: string;
  course_id: string;
  trainee_name: string;
  course_title: string;
  days_completed: number;
  completed_at: Date;
  issued_at: Date;
  status: 'ACTIVE' | 'REVOKED';
  revoked_at: Date | null;
  signature: string;
  signature_algorithm: string;
  signature_version: string;
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function toCourseCertificate(record: CertificateRecord): CourseCertificate {
  return {
    courseId: record.course_id,
    courseTitle: record.course_title,
    traineeName: record.trainee_name,
    daysCompleted: record.days_completed,
    completedAt: record.completed_at.toISOString(),
    issuedAt: record.issued_at.toISOString(),
    certificateId: record.certificate_id,
    status: record.status,
    signature: record.signature,
    signatureAlgorithm: record.signature_algorithm,
    signatureVersion: record.signature_version,
  };
}

function toVerificationPayload(record: CertificateRecord) {
  return {
    certificateId: record.certificate_id,
    traineeName: record.trainee_name,
    courseTitle: record.course_title,
    completedAt: record.completed_at.toISOString(),
    issuedAt: record.issued_at.toISOString(),
  };
}

/**
 * Pure: calculates course completion and certificate eligibility.
 *
 * A course is certificate-eligible when:
 * - Every curriculum day is completed.
 * - Every required (non-stretch) task has been approved.
 */
export function summarizeCompletions(
  days: { id: string; course_id: string }[],
  completions: { curriculum_day_id: string; completed_at: Date }[],
  requiredTasks: RequiredTaskProgress[]
): Map<string, CourseCompletion> {
  const completedAtByDay = new Map(
    completions.map((completion) => [completion.curriculum_day_id, completion.completed_at])
  );

  const dayTally = new Map<string, { dayCount: number; done: number; latest: Date | null }>();

  for (const day of days) {
    const entry = dayTally.get(day.course_id) ?? {
      dayCount: 0,
      done: 0,
      latest: null,
    };

    entry.dayCount += 1;

    const completedAt = completedAtByDay.get(day.id);

    if (completedAt) {
      entry.done += 1;

      if (!entry.latest || completedAt > entry.latest) {
        entry.latest = completedAt;
      }
    }

    dayTally.set(day.course_id, entry);
  }

  const taskTally = new Map<string, { required: number; approved: number }>();

  for (const task of requiredTasks) {
    const courseId = task.curriculum_day.course_id;

    const entry = taskTally.get(courseId) ?? {
      required: 0,
      approved: 0,
    };

    entry.required += 1;

    if (task.progress[0]?.review_status === 'approved') {
      entry.approved += 1;
    }

    taskTally.set(courseId, entry);
  }

  return new Map(
    [...dayTally].map(([courseId, dayEntry]) => {
      const taskEntry = taskTally.get(courseId) ?? {
        required: 0,
        approved: 0,
      };

      const daysComplete = dayEntry.dayCount > 0 && dayEntry.done === dayEntry.dayCount;

      const allTasksApproved = taskEntry.required > 0 && taskEntry.approved === taskEntry.required;

      return [
        courseId,
        {
          dayCount: dayEntry.dayCount,
          complete: daysComplete,
          completedAt: daysComplete ? dayEntry.latest : null,
          requiredTaskCount: taskEntry.required,
          approvedTaskCount: taskEntry.approved,
          allTasksApproved,
        },
      ];
    })
  );
}

export class CertificateService {
  private async loadSummary(
    traineeId: string,
    db: Parameters<typeof certificateRepository.findAllDays>[0] = prisma
  ) {
    const [days, completions, requiredTasks] = await Promise.all([
      certificateRepository.findAllDays(db),
      certificateRepository.findCompletions(traineeId, db),
      certificateRepository.findRequiredTaskProgress(traineeId, db),
    ]);

    return summarizeCompletions(days, completions, requiredTasks);
  }

  /**
   * Returns courses eligible for certificates.
   * Every day must be completed and every required task approved.
   */
  async getCompletedCourseIds(traineeId: string): Promise<string[]> {
    const summary = await this.loadSummary(traineeId);

    return [...summary]
      .filter(([, completion]) => completion.complete && completion.allTasksApproved)
      .map(([courseId]) => courseId);
  }

  /**
   * Issues a certificate when eligible, or returns the existing persisted certificate.
   * 404 for an unknown course. 403 until every day is completed and every required task is approved.
   */
  async getCourseCertificate(traineeId: string, courseId: string): Promise<CourseCertificate> {
    const existing = await certificateRepository.findCertificateByTraineeAndCourse(
      traineeId,
      courseId
    );
    if (existing) return toCourseCertificate(existing);

    const course = await certificateRepository.findCourse(courseId);
    if (!course) {
      throw new NotFoundError('Course not found.');
    }

    const completion = (await this.loadSummary(traineeId)).get(courseId);
    if (!completion?.complete || !completion.allTasksApproved || !completion.completedAt) {
      throw new ForbiddenError(CERTIFICATE_LOCKED_MESSAGE);
    }

    const trainee = await certificateRepository.findTrainee(traineeId);
    if (!trainee) {
      throw new NotFoundError('Trainee not found.');
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const certificateId = generateCertificateId();

      try {
        const created = await prisma.$transaction(async (tx) => {
          const existingInTx = await certificateRepository.findCertificateByTraineeAndCourse(
            traineeId,
            courseId,
            tx
          );
          if (existingInTx) return existingInTx;

          const summaryInTx = (await this.loadSummary(traineeId, tx)).get(courseId);
          if (!summaryInTx?.complete || !summaryInTx.allTasksApproved || !summaryInTx.completedAt) {
            throw new ForbiddenError(CERTIFICATE_LOCKED_MESSAGE);
          }

          const courseInTx = await certificateRepository.findCourse(courseId, tx);
          const traineeInTx = await certificateRepository.findTrainee(traineeId, tx);
          if (!courseInTx) throw new NotFoundError('Course not found.');
          if (!traineeInTx) throw new NotFoundError('Trainee not found.');

          const txIssuedAt = new Date();
          const txPayload = {
            certificateId,
            traineeName: traineeInTx.name,
            courseTitle: courseInTx.title,
            completedAt: summaryInTx.completedAt.toISOString(),
            issuedAt: txIssuedAt.toISOString(),
          };

          return await certificateRepository.createCertificate(
            {
              certificate_id: certificateId,
              trainee_id: traineeId,
              course_id: courseId,
              trainee_name: traineeInTx.name,
              course_title: courseInTx.title,
              days_completed: summaryInTx.dayCount,
              completed_at: summaryInTx.completedAt,
              issued_at: txIssuedAt,
              signature: signCertificatePayload(txPayload),
              signature_algorithm: CERTIFICATE_SIGNATURE_ALGORITHM,
              signature_version: CERTIFICATE_SIGNATURE_VERSION,
            },
            tx
          );
        });

        return toCourseCertificate(created);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          const conflict = await certificateRepository.findCertificateByTraineeAndCourse(
            traineeId,
            courseId
          );
          if (conflict) return toCourseCertificate(conflict);
          // Certificate ID collision is extremely unlikely; retry with a new ID.
          continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to generate a unique certificate ID.');
  }

  async verifyCertificate(certificateId: string): Promise<CertificateVerificationResponse> {
    const record = (await certificateRepository.findCertificateByCertificateId(
      certificateId
    )) as CertificateRecord | null;

    if (!record) {
      return {
        valid: false,
        signatureValid: false,
        status: 'UNKNOWN',
        certificateId,
        traineeName: null,
        courseTitle: null,
        completedAt: null,
        issuedAt: null,
        message: 'Certificate not found.',
      };
    }

    const signatureValid = verifyCertificatePayload(
      toVerificationPayload(record),
      record.signature
    );

    if (!signatureValid) {
      return {
        valid: false,
        signatureValid: false,
        status: record.status,
        certificateId: record.certificate_id,
        traineeName: record.trainee_name,
        courseTitle: record.course_title,
        completedAt: record.completed_at.toISOString(),
        issuedAt: record.issued_at.toISOString(),
        message: 'Certificate signature is invalid.',
      };
    }

    if (record.status === 'REVOKED') {
      return {
        valid: false,
        signatureValid: true,
        status: 'REVOKED',
        certificateId: record.certificate_id,
        traineeName: record.trainee_name,
        courseTitle: record.course_title,
        completedAt: record.completed_at.toISOString(),
        issuedAt: record.issued_at.toISOString(),
        message: 'Certificate has been revoked.',
      };
    }

    return {
      valid: true,
      signatureValid: true,
      status: 'ACTIVE',
      certificateId: record.certificate_id,
      traineeName: record.trainee_name,
      courseTitle: record.course_title,
      completedAt: record.completed_at.toISOString(),
      issuedAt: record.issued_at.toISOString(),
      message: 'Certificate is valid.',
    };
  }

  async revokeCertificate(certificateId: string): Promise<CourseCertificate> {
    const record = (await certificateRepository.findCertificateByCertificateId(
      certificateId
    )) as CertificateRecord | null;
    if (!record) throw new NotFoundError('Certificate not found.');
    if (record.status === 'REVOKED') return toCourseCertificate(record);

    const revoked = (await certificateRepository.revokeCertificate(
      certificateId,
      new Date()
    )) as CertificateRecord;
    return toCourseCertificate(revoked);
  }
}
