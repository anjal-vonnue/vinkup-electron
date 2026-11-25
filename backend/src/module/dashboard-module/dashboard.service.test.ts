import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../errors/AppError';

const repo = vi.hoisted(() => ({
  findDayWithCourseSize: vi.fn(),
  findCourseWithDays: vi.fn(),
  sumActivity: vi.fn(),
  findActivityOn: vi.fn(),
  findLatestTyping: vi.fn(),
  findTypingSince: vi.fn(),
  findReworkTasks: vi.fn(),
  findLatestTaskReview: vi.fn(),
  findUnreadTaskComments: vi.fn(),
  markTaskCommentRead: vi.fn(),
  findTaskCommentForTrainee: vi.fn(),
}));
const { mockGetDayStatuses } = vi.hoisted(() => ({ mockGetDayStatuses: vi.fn() }));
const { mockCompletedCourseIds } = vi.hoisted(() => ({ mockCompletedCourseIds: vi.fn() }));

vi.mock('./dashboard.repository', () => ({
  DashboardRepository: class {
    findDayWithCourseSize = repo.findDayWithCourseSize;
    findCourseWithDays = repo.findCourseWithDays;
    sumActivity = repo.sumActivity;
    findActivityOn = repo.findActivityOn;
    findLatestTyping = repo.findLatestTyping;
    findTypingSince = repo.findTypingSince;
    findReworkTasks = repo.findReworkTasks;
    findLatestTaskReview = repo.findLatestTaskReview;
    findUnreadTaskComments = repo.findUnreadTaskComments;
    markTaskCommentRead = repo.markTaskCommentRead;
    findTaskCommentForTrainee = repo.findTaskCommentForTrainee;
  },
}));

vi.mock('../progress-module/progress.service', () => ({
  ProgressService: class {
    getDayStatuses = mockGetDayStatuses;
  },
}));

vi.mock('./certificate.service', () => ({
  CertificateService: class {
    getCompletedCourseIds = mockCompletedCourseIds;
  },
}));

import { DashboardService } from './dashboard.service';

const traineeId = 'trainee-1';
// 2026-10-01 10:00 in India.
const NOW = new Date('2026-10-01T04:30:00.000Z');

const html1 = {
  id: 'html-day-01',
  course_id: 'html',
  day_number: 1,
  title: 'Structure',
  subtitle: 'Valid pages.',
};
const html2 = {
  id: 'html-day-02',
  course_id: 'html',
  day_number: 2,
  title: 'Semantics',
  subtitle: 'Right tags.',
};

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DashboardService();

    mockGetDayStatuses.mockResolvedValue([
      { dayId: 'html-day-01', status: 'COMPLETED' },
      { dayId: 'html-day-02', status: 'UNLOCKED' },
      { dayId: 'css-day-01', status: 'LOCKED' },
    ]);
    repo.findDayWithCourseSize.mockResolvedValue({ ...html2, course: { _count: { days: 5 } } });
    repo.sumActivity.mockResolvedValue({ _sum: { active_seconds: null, coding_seconds: null } });
    repo.findActivityOn.mockResolvedValue(null);
    repo.findLatestTyping.mockResolvedValue(null);
    repo.findTypingSince.mockResolvedValue([]);
    mockCompletedCourseIds.mockResolvedValue([]);
  });

  describe('getDashboard', () => {
    it('sends the UNLOCKED day as nextDay, with its course size', async () => {
      const dashboard = await service.getDashboard(traineeId, NOW);

      expect(dashboard.nextDay).toEqual({
        id: 'html-day-02',
        courseId: 'html',
        dayNumber: 2,
        title: 'Semantics',
        description: 'Right tags.',
        status: 'UNLOCKED',
        courseTotalDays: 5,
      });
      expect(repo.findDayWithCourseSize).toHaveBeenCalledWith('html-day-02');
    });

    it('sends nextDay null and skips the day lookup when every day is completed', async () => {
      mockGetDayStatuses.mockResolvedValue([
        { dayId: 'html-day-01', status: 'COMPLETED' },
        { dayId: 'html-day-02', status: 'COMPLETED' },
      ]);

      const dashboard = await service.getDashboard(traineeId, NOW);

      expect(dashboard.nextDay).toBeNull();
      expect(dashboard.totalDaysCompleteOverall).toBe(2);
      expect(repo.findDayWithCourseSize).not.toHaveBeenCalled();
    });

    it('counts completed days and all days', async () => {
      const dashboard = await service.getDashboard(traineeId, NOW);

      expect(dashboard.totalDaysCompleteOverall).toBe(1);
      expect(dashboard.totalDaysOverall).toBe(3);
    });

    it('sends zeros when the trainee has no activity', async () => {
      const dashboard = await service.getDashboard(traineeId, NOW);

      expect(dashboard.today).toEqual({ activeSeconds: 0, codingSeconds: 0 });
      expect(dashboard.total).toEqual({ activeSeconds: 0, codingSeconds: 0 });
    });

    it("sends today's row and the all-time sums", async () => {
      repo.findActivityOn.mockResolvedValue({ active_seconds: 600, coding_seconds: 400 });
      repo.sumActivity.mockResolvedValue({ _sum: { active_seconds: 9000, coding_seconds: 5000 } });

      const dashboard = await service.getDashboard(traineeId, NOW);

      expect(dashboard.today).toEqual({ activeSeconds: 600, codingSeconds: 400 });
      expect(dashboard.total).toEqual({ activeSeconds: 9000, codingSeconds: 5000 });
    });

    it("looks up today's row by the India calendar date", async () => {
      await service.getDashboard(traineeId, NOW);

      expect(repo.findActivityOn).toHaveBeenCalledWith(
        traineeId,
        new Date('2026-10-01T00:00:00.000Z')
      );
    });

    it('reads typing results from the start of the 30-day trend window', async () => {
      await service.getDashboard(traineeId, NOW);

      // 29 days before 2026-10-01 is 2026-09-02; the window starts at its India midnight.
      expect(repo.findTypingSince).toHaveBeenCalledWith(
        traineeId,
        new Date('2026-09-02T00:00:00.000+05:30')
      );
    });

    it('asks every query for the logged-in trainee only', async () => {
      await service.getDashboard(traineeId, NOW);

      expect(mockGetDayStatuses).toHaveBeenCalledWith(traineeId);
      expect(repo.sumActivity).toHaveBeenCalledWith(traineeId);
      expect(repo.findLatestTyping).toHaveBeenCalledWith(traineeId);
    });

    it('throws NotFoundError if the unlocked day has disappeared', async () => {
      repo.findDayWithCourseSize.mockResolvedValue(null);

      await expect(service.getDashboard(traineeId, NOW)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('sends the ids of the courses the trainee has finished', async () => {
      mockCompletedCourseIds.mockResolvedValue(['html']);

      const dashboard = await service.getDashboard(traineeId, NOW);

      expect(dashboard.completedCourseIds).toEqual(['html']);
      expect(mockCompletedCourseIds).toHaveBeenCalledWith(traineeId);
    });
  });

  describe('getCourseDays', () => {
    it("returns the course's days with this trainee's status", async () => {
      repo.findCourseWithDays.mockResolvedValue({ id: 'html', days: [html1, html2] });

      await expect(service.getCourseDays(traineeId, 'html')).resolves.toEqual([
        {
          id: 'html-day-01',
          courseId: 'html',
          dayNumber: 1,
          title: 'Structure',
          description: 'Valid pages.',
          status: 'COMPLETED',
        },
        {
          id: 'html-day-02',
          courseId: 'html',
          dayNumber: 2,
          title: 'Semantics',
          description: 'Right tags.',
          status: 'UNLOCKED',
        },
      ]);
    });

    it('treats a day missing from the statuses as LOCKED', async () => {
      const extra = { ...html2, id: 'html-day-03', day_number: 3 };
      repo.findCourseWithDays.mockResolvedValue({ id: 'html', days: [extra] });

      const [day] = await service.getCourseDays(traineeId, 'html');

      expect(day.status).toBe('LOCKED');
    });

    it('throws NotFoundError for an unknown course', async () => {
      repo.findCourseWithDays.mockResolvedValue(null);

      await expect(service.getCourseDays(traineeId, 'cobol')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('getReworkTasks', () => {
    it('returns an empty array when no rework tasks exist', async () => {
      repo.findReworkTasks.mockResolvedValue([]);

      const result = await service.getReworkTasks(traineeId);

      expect(result).toEqual([]);
      expect(repo.findReworkTasks).toHaveBeenCalledWith(traineeId);
    });

    it('returns formatted rework tasks with latest review details', async () => {
      const reworkRow = {
        task_id: 'html-day-01-t-1',
        submission_count: 2,
        task: {
          id: 'html-day-01-t-1',
          title: 'Semantic HTML Practice',
          sequence_order: 1,
          curriculum_day_id: 'html-day-01',
          curriculum_day: {
            id: 'html-day-01',
            day_number: 1,
            course_id: 'html',
            course: { title: 'HTML & Semantic Web' },
          },
        },
      };

      const reviewRow = {
        id: 'rev-1',
        admin_id: 'admin-1',
        submission_no: 2,
        decision: 'rework',
        feedback: 'Please fix the header hierarchy.',
        reviewed_at: new Date('2026-10-01T08:00:00.000Z'),
        admin: { name: 'Mentor Jane' },
      };

      repo.findReworkTasks.mockResolvedValue([reworkRow]);
      repo.findLatestTaskReview.mockResolvedValue(reviewRow);

      const result = await service.getReworkTasks(traineeId);

      expect(result).toEqual([
        {
          taskId: 'html-day-01-t-1',
          taskTitle: 'Semantic HTML Practice',
          sequenceOrder: 1,
          dayId: 'html-day-01',
          dayNumber: 1,
          courseId: 'html',
          courseTitle: 'HTML & Semantic Web',
          submissionCount: 2,
          latestReview: {
            id: 'rev-1',
            adminId: 'admin-1',
            adminName: 'Mentor Jane',
            decision: 'rework',
            feedback: 'Please fix the header hierarchy.',
            reviewedAt: '2026-10-01T08:00:00.000Z',
          },
        },
      ]);
    });
  });

  describe('unread task comments', () => {
    it('returns comment details with task and day navigation context', async () => {
      repo.findUnreadTaskComments.mockResolvedValue([
        {
          id: 'review-1',
          task_id: 'html-day-01-t-1',
          feedback: 'Add a footer.',
          reviewed_at: new Date('2026-11-24T10:00:00.000Z'),
          admin: { name: 'Mentor Jane' },
          task: {
            id: 'html-day-01-t-1',
            title: 'Profile page',
            curriculum_day: {
              id: 'html-day-01',
              day_number: 1,
              course: { title: 'HTML' },
            },
          },
        },
      ]);

      await expect(service.getUnreadTaskComments(traineeId)).resolves.toEqual([
        {
          id: 'review-1',
          taskId: 'html-day-01-t-1',
          taskTitle: 'Profile page',
          dayId: 'html-day-01',
          dayNumber: 1,
          courseTitle: 'HTML',
          adminName: 'Mentor Jane',
          feedback: 'Add a footer.',
          reviewedAt: '2026-11-24T10:00:00.000Z',
        },
      ]);
      expect(repo.findUnreadTaskComments).toHaveBeenCalledWith(traineeId);
    });

    it('treats a repeated read update as success for an owned comment', async () => {
      repo.markTaskCommentRead.mockResolvedValue({ count: 0 });
      repo.findTaskCommentForTrainee.mockResolvedValue({ id: 'review-1' });

      await expect(service.markTaskCommentRead(traineeId, 'review-1')).resolves.toBeUndefined();
    });

    it('rejects attempts to mark another trainee comment as read', async () => {
      repo.markTaskCommentRead.mockResolvedValue({ count: 0 });
      repo.findTaskCommentForTrainee.mockResolvedValue(null);

      await expect(service.markTaskCommentRead(traineeId, 'review-foreign')).rejects.toBeInstanceOf(
        NotFoundError
      );
    });
  });
});
