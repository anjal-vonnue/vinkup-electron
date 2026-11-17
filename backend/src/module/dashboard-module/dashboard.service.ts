import type {
  CourseDaysResponse,
  DashboardResponse,
  DayStatus,
  DaySummary,
  NextDay,
  ReworkTaskSummary,
} from '@itp/types';
import { NotFoundError } from '../../errors/AppError';
import { istDateString, istDateValue, istDayStart } from '../../utils/istDate';
import { ProgressService } from '../progress-module/progress.service';
import { DashboardRepository } from './dashboard.repository';
import { buildTypingSummary, TYPING_TREND_DAYS } from './dashboard.typing';
import { CertificateService } from './certificate.service';

const certificateService = new CertificateService();
const dashboardRepository = new DashboardRepository();
const progressService = new ProgressService();

type DayRow = {
  id: string;
  course_id: string;
  day_number: number;
  title: string;
  subtitle: string;
};

function toDaySummary(day: DayRow, status: DayStatus): DaySummary {
  return {
    id: day.id,
    courseId: day.course_id,
    dayNumber: day.day_number,
    title: day.title,
    description: day.subtitle, // the day's one-line subtitle is the card's description
    status,
  };
}

export class DashboardService {
  async getDashboard(traineeId: string, now: Date = new Date()): Promise<DashboardResponse> {
    const trendStart = istDateString(TYPING_TREND_DAYS - 1, now);

    const [statuses, totals, today, latestTyping, recentTyping, completedCourseIds] =
      await Promise.all([
        progressService.getDayStatuses(traineeId),
        dashboardRepository.sumActivity(traineeId),
        dashboardRepository.findActivityOn(traineeId, istDateValue(0, now)),
        dashboardRepository.findLatestTyping(traineeId),
        dashboardRepository.findTypingSince(traineeId, istDayStart(trendStart)),
        certificateService.getCompletedCourseIds(traineeId),
      ]);

    // There is at most one UNLOCKED day; none once every day is completed.
    const next = statuses.find((day) => day.status === 'UNLOCKED');

    return {
      nextDay: next ? await this.getNextDay(next.dayId) : null,
      totalDaysCompleteOverall: statuses.filter((day) => day.status === 'COMPLETED').length,
      totalDaysOverall: statuses.length,
      today: {
        activeSeconds: today?.active_seconds ?? 0,
        codingSeconds: today?.coding_seconds ?? 0,
      },
      total: {
        activeSeconds: totals._sum.active_seconds ?? 0,
        codingSeconds: totals._sum.coding_seconds ?? 0,
      },
      typing: buildTypingSummary(latestTyping, recentTyping, now),
      completedCourseIds,
    };
  }

  /** The days of one course with this trainee's status. Throws 404 for an unknown course. */
  async getCourseDays(traineeId: string, courseId: string): Promise<CourseDaysResponse> {
    const [course, statuses] = await Promise.all([
      dashboardRepository.findCourseWithDays(courseId),
      progressService.getDayStatuses(traineeId),
    ]);
    if (!course) throw new NotFoundError('Course not found.');

    const statusByDayId = new Map(statuses.map((day) => [day.dayId, day.status]));

    return course.days.map((day) => toDaySummary(day, statusByDayId.get(day.id) ?? 'LOCKED'));
  }

  private async getNextDay(dayId: string): Promise<NextDay> {
    const day = await dashboardRepository.findDayWithCourseSize(dayId);
    if (!day) throw new NotFoundError('Day not found.');

    return { ...toDaySummary(day, 'UNLOCKED'), courseTotalDays: day.course._count.days };
  }

  /** Rework tasks requested by mentors for this trainee across all days. */
  async getReworkTasks(traineeId: string): Promise<ReworkTaskSummary[]> {
    const progressRows = await dashboardRepository.findReworkTasks(traineeId);
    if (progressRows.length === 0) return [];

    const reviews = await Promise.all(
      progressRows.map((row) => dashboardRepository.findLatestTaskReview(traineeId, row.task_id))
    );

    return progressRows.map((row, index) => {
      const review = reviews[index];
      return {
        taskId: row.task.id,
        taskTitle: row.task.title,
        sequenceOrder: row.task.sequence_order,
        dayId: row.task.curriculum_day.id,
        dayNumber: row.task.curriculum_day.day_number,
        courseId: row.task.curriculum_day.course_id,
        courseTitle: row.task.curriculum_day.course.title,
        submissionCount: row.submission_count,
        latestReview: review
          ? {
              id: review.id,
              adminId: review.admin_id,
              adminName: review.admin.name,
              decision: 'rework' as const,
              feedback: review.feedback,
              reviewedAt: review.reviewed_at.toISOString(),
            }
          : null,
      };
    });
  }
}
