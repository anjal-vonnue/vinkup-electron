import { prisma } from '../../lib/prisma';
import type { Prisma } from '../../generated/prisma/client';

type DbClient = Prisma.TransactionClient | typeof prisma;

export class CertificateRepository {
  findCourse = (courseId: string, db: DbClient = prisma) =>
    db.course.findUnique({ where: { id: courseId }, select: { id: true, title: true } });

  findTrainee = (traineeId: string, db: DbClient = prisma) =>
    db.trainee.findUnique({ where: { id: traineeId }, select: { id: true, name: true } });

  /** Every curriculum day with its course (about 54 rows). */
  findAllDays = (db: DbClient = prisma) =>
    db.curriculum_day.findMany({ select: { id: true, course_id: true } });

  /** This trainee's completions, one bulk query. */
  findCompletions = (traineeId: string, db: DbClient = prisma) =>
    db.day_completion.findMany({
      where: { trainee_id: traineeId },
      select: { curriculum_day_id: true, completed_at: true },
    });

  findRequiredTaskProgress = (traineeId: string, db: DbClient = prisma) =>
    db.task.findMany({
      where: { is_stretch_goal: false },
      select: {
        id: true,
        curriculum_day: {
          select: {
            course_id: true,
          },
        },
        progress: {
          where: { trainee_id: traineeId },
          select: {
            review_status: true,
          },
        },
      },
    });

  /**
   * Two numbers the certificate sheet shows, derived live from task_progress:
   *   - startedAt: earliest `task_progress.created_at` across this trainee's
   *     tasks in the course. The row is created on the first heartbeat or
   *     save, so this is the moment the timer first started.
   *   - timeSpentSeconds: sum of `time_spent_seconds` across those tasks.
   *
   * Nulls are possible (`_min` when there are no rows, `_sum` when the column
   * is all zero); the caller picks a fallback for `startedAt`.
   */
  findCourseActivity = async (
    traineeId: string,
    courseId: string,
    db: DbClient = prisma
  ): Promise<{ startedAt: Date | null; timeSpentSeconds: number }> => {
    const result = await db.task_progress.aggregate({
      where: {
        trainee_id: traineeId,
        task: { curriculum_day: { course_id: courseId } },
      },
      _min: { created_at: true },
      _sum: { time_spent_seconds: true },
    });

    return {
      startedAt: result._min.created_at,
      timeSpentSeconds: result._sum.time_spent_seconds ?? 0,
    };
  };

  findCertificateByTraineeAndCourse = (
    traineeId: string,
    courseId: string,
    db: DbClient = prisma
  ) =>
    db.certificate.findUnique({
      where: { trainee_id_course_id: { trainee_id: traineeId, course_id: courseId } },
    });

  findCertificateByCertificateId = (certificateId: string, db: DbClient = prisma) =>
    db.certificate.findUnique({ where: { certificate_id: certificateId } });

  createCertificate = (
    data: {
      certificate_id: string;
      trainee_id: string;
      course_id: string;
      trainee_name: string;
      course_title: string;
      days_completed: number;
      completed_at: Date;
      issued_at: Date;
      signature: string;
      signature_algorithm: string;
      signature_version: string;
    },
    db: DbClient = prisma
  ) => db.certificate.create({ data });

  revokeCertificate = (certificateId: string, revokedAt: Date, db: DbClient = prisma) =>
    db.certificate.update({
      where: { certificate_id: certificateId },
      data: { status: 'REVOKED', revoked_at: revokedAt },
    });
}
