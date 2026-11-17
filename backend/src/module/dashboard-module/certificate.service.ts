import type { CourseCertificate } from '@itp/types';
import { ForbiddenError, NotFoundError } from '../../errors/AppError';
import { CertificateRepository } from './certificate.repository';
import { buildCertificateId } from './certificate.util';

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
  private async loadSummary(traineeId: string) {
    const [days, completions, requiredTasks] = await Promise.all([
      certificateRepository.findAllDays(),
      certificateRepository.findCompletions(traineeId),
      certificateRepository.findRequiredTaskProgress(traineeId),
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
   * 404 for an unknown course.
   * 403 until every day is completed and every required task is approved.
   */
  async getCourseCertificate(traineeId: string, courseId: string): Promise<CourseCertificate> {
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

    return {
      courseId: course.id,
      courseTitle: course.title,
      traineeName: trainee.name,
      daysCompleted: completion.dayCount,
      completedAt: completion.completedAt.toISOString(),
      certificateId: buildCertificateId(traineeId, courseId),
    };
  }
}
