import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, NotFoundError } from '../../errors/AppError';
import { buildCertificateId } from './certificate.util';

const repo = vi.hoisted(() => ({
  findCourse: vi.fn(),
  findTrainee: vi.fn(),
  findAllDays: vi.fn(),
  findCompletions: vi.fn(),
  findRequiredTaskProgress: vi.fn(),
}));

vi.mock('./certificate.repository', () => ({
  CertificateRepository: class {
    findCourse = repo.findCourse;
    findTrainee = repo.findTrainee;
    findAllDays = repo.findAllDays;
    findCompletions = repo.findCompletions;
    findRequiredTaskProgress = repo.findRequiredTaskProgress;
  },
}));

import {
  CERTIFICATE_LOCKED_MESSAGE,
  CertificateService,
  summarizeCompletions,
} from './certificate.service';

const traineeId = 'trainee-1';
const courseId = 'html';

const course = {
  id: courseId,
  title: 'HTML & Semantic Web',
};

const trainee = {
  name: 'Alex Morgan',
};

const days = [
  { id: 'html-day-01', course_id: courseId },
  { id: 'html-day-02', course_id: courseId },
];

const completedDays = [
  {
    curriculum_day_id: 'html-day-01',
    completed_at: new Date('2026-11-10T10:00:00.000Z'),
  },
  {
    curriculum_day_id: 'html-day-02',
    completed_at: new Date('2026-11-11T10:00:00.000Z'),
  },
];

const requiredTasks = [
  {
    id: 'task-1',
    curriculum_day: { course_id: courseId },
    progress: [{ review_status: 'approved' }],
  },
  {
    id: 'task-2',
    curriculum_day: { course_id: courseId },
    progress: [{ review_status: 'approved' }],
  },
];

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

  it('marks a course incomplete when no days are completed', () => {
    const result = summarizeCompletions(days, [], requiredTasks);

    expect(result.get(courseId)?.complete).toBe(false);
    expect(result.get(courseId)?.completedAt).toBeNull();
  });

  it('uses the latest completion date when all days are completed', () => {
    const result = summarizeCompletions(days, completedDays, requiredTasks);

    expect(result.get(courseId)?.completedAt).toEqual(new Date('2026-11-11T10:00:00.000Z'));
  });

  it('counts every required task', () => {
    const result = summarizeCompletions(days, completedDays, requiredTasks);

    expect(result.get(courseId)?.requiredTaskCount).toBe(2);
  });

  it('counts only approved tasks as approved', () => {
    const tasks = [
      requiredTasks[0],
      {
        ...requiredTasks[1],
        progress: [{ review_status: 'pending' }],
      },
    ];

    const result = summarizeCompletions(days, completedDays, tasks);

    expect(result.get(courseId)?.approvedTaskCount).toBe(1);
    expect(result.get(courseId)?.allTasksApproved).toBe(false);
  });

  it.each(['pending', 'rework', null])(
    'does not consider a course eligible when a required task has review status %s',
    (reviewStatus) => {
      const tasks = [
        requiredTasks[0],
        {
          ...requiredTasks[1],
          progress: [{ review_status: reviewStatus }],
        },
      ];

      const result = summarizeCompletions(days, completedDays, tasks);

      expect(result.get(courseId)?.allTasksApproved).toBe(false);
      expect(result.get(courseId)?.approvedTaskCount).toBe(1);
    }
  );

  it('does not consider a course eligible when a required task has no progress record', () => {
    const tasks = [
      requiredTasks[0],
      {
        ...requiredTasks[1],
        progress: [],
      },
    ];

    const result = summarizeCompletions(days, completedDays, tasks);

    expect(result.get(courseId)?.requiredTaskCount).toBe(2);
    expect(result.get(courseId)?.approvedTaskCount).toBe(1);
    expect(result.get(courseId)?.allTasksApproved).toBe(false);
  });

  it('considers all required tasks approved when every task is approved', () => {
    const result = summarizeCompletions(days, completedDays, requiredTasks);

    expect(result.get(courseId)?.approvedTaskCount).toBe(2);
    expect(result.get(courseId)?.allTasksApproved).toBe(true);
  });

  it('does not consider a course eligible when it has no required tasks', () => {
    const result = summarizeCompletions(days, completedDays, []);

    expect(result.get(courseId)?.requiredTaskCount).toBe(0);
    expect(result.get(courseId)?.approvedTaskCount).toBe(0);
    expect(result.get(courseId)?.allTasksApproved).toBe(false);
  });

  it('does not consider a course eligible when days are incomplete even if all tasks are approved', () => {
    const result = summarizeCompletions(days, [completedDays[0]], requiredTasks);

    expect(result.get(courseId)?.complete).toBe(false);
    expect(result.get(courseId)?.allTasksApproved).toBe(true);
  });

  it('calculates completion independently for multiple courses', () => {
    const multipleDays = [...days, { id: 'css-day-01', course_id: 'css' }];

    const multipleCompletions = [
      ...completedDays,
      {
        curriculum_day_id: 'css-day-01',
        completed_at: new Date('2026-11-12T10:00:00.000Z'),
      },
    ];

    const multipleTasks = [
      ...requiredTasks,
      {
        id: 'css-task-1',
        curriculum_day: { course_id: 'css' },
        progress: [{ review_status: 'rework' }],
      },
    ];

    const result = summarizeCompletions(multipleDays, multipleCompletions, multipleTasks);

    expect(result.get('html')?.allTasksApproved).toBe(true);
    expect(result.get('html')?.complete).toBe(true);

    expect(result.get('css')?.allTasksApproved).toBe(false);
    expect(result.get('css')?.complete).toBe(true);
  });

  it('returns an empty map when there are no curriculum days', () => {
    const result = summarizeCompletions([], [], []);

    expect(result.size).toBe(0);
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
  });

  describe('getCompletedCourseIds', () => {
    it('returns a course when all days are completed and all required tasks are approved', async () => {
      const result = await service.getCompletedCourseIds(traineeId);

      expect(result).toEqual([courseId]);
    });

    it('does not return a course when a required task is pending', async () => {
      repo.findRequiredTaskProgress.mockResolvedValue([
        requiredTasks[0],
        {
          ...requiredTasks[1],
          progress: [{ review_status: 'pending' }],
        },
      ]);

      const result = await service.getCompletedCourseIds(traineeId);

      expect(result).toEqual([]);
    });

    it('does not return a course when a required task is in rework', async () => {
      repo.findRequiredTaskProgress.mockResolvedValue([
        requiredTasks[0],
        {
          ...requiredTasks[1],
          progress: [{ review_status: 'rework' }],
        },
      ]);

      const result = await service.getCompletedCourseIds(traineeId);

      expect(result).toEqual([]);
    });

    it('does not return a course when a required task has never been reviewed', async () => {
      repo.findRequiredTaskProgress.mockResolvedValue([
        requiredTasks[0],
        {
          ...requiredTasks[1],
          progress: [{ review_status: null }],
        },
      ]);

      const result = await service.getCompletedCourseIds(traineeId);

      expect(result).toEqual([]);
    });

    it('does not return a course when a required task has no progress record', async () => {
      repo.findRequiredTaskProgress.mockResolvedValue([
        requiredTasks[0],
        {
          ...requiredTasks[1],
          progress: [],
        },
      ]);

      const result = await service.getCompletedCourseIds(traineeId);

      expect(result).toEqual([]);
    });

    it('does not return a course when some days are incomplete', async () => {
      repo.findCompletions.mockResolvedValue([completedDays[0]]);

      const result = await service.getCompletedCourseIds(traineeId);

      expect(result).toEqual([]);
    });

    it('does not return a course when it has no required tasks', async () => {
      repo.findRequiredTaskProgress.mockResolvedValue([]);

      const result = await service.getCompletedCourseIds(traineeId);

      expect(result).toEqual([]);
    });

    it('returns only eligible courses when multiple courses exist', async () => {
      repo.findAllDays.mockResolvedValue([...days, { id: 'css-day-01', course_id: 'css' }]);

      repo.findCompletions.mockResolvedValue([
        ...completedDays,
        {
          curriculum_day_id: 'css-day-01',
          completed_at: new Date('2026-11-12T10:00:00.000Z'),
        },
      ]);

      repo.findRequiredTaskProgress.mockResolvedValue([
        ...requiredTasks,
        {
          id: 'css-task-1',
          curriculum_day: { course_id: 'css' },
          progress: [{ review_status: 'rework' }],
        },
      ]);

      const result = await service.getCompletedCourseIds(traineeId);

      expect(result).toEqual(['html']);
    });

    it('loads days, completions, and required task progress for the trainee', async () => {
      await service.getCompletedCourseIds(traineeId);

      expect(repo.findAllDays).toHaveBeenCalledOnce();
      expect(repo.findCompletions).toHaveBeenCalledWith(traineeId);
      expect(repo.findRequiredTaskProgress).toHaveBeenCalledWith(traineeId);
    });
  });

  describe('getCourseCertificate', () => {
    it('returns a certificate when all days are completed and all required tasks are approved', async () => {
      const result = await service.getCourseCertificate(traineeId, courseId);

      expect(result).toEqual({
        courseId,
        courseTitle: 'HTML & Semantic Web',
        traineeName: 'Alex Morgan',
        daysCompleted: 2,
        completedAt: '2026-11-11T10:00:00.000Z',
        certificateId: buildCertificateId(traineeId, courseId),
      });
    });

    it('throws NotFoundError when the course does not exist', async () => {
      repo.findCourse.mockResolvedValue(null);

      await expect(service.getCourseCertificate(traineeId, courseId)).rejects.toBeInstanceOf(
        NotFoundError
      );

      expect(repo.findAllDays).not.toHaveBeenCalled();
      expect(repo.findTrainee).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError when a required task is pending', async () => {
      repo.findRequiredTaskProgress.mockResolvedValue([
        requiredTasks[0],
        {
          ...requiredTasks[1],
          progress: [{ review_status: 'pending' }],
        },
      ]);

      await expect(service.getCourseCertificate(traineeId, courseId)).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it('throws ForbiddenError when a required task is in rework', async () => {
      repo.findRequiredTaskProgress.mockResolvedValue([
        requiredTasks[0],
        {
          ...requiredTasks[1],
          progress: [{ review_status: 'rework' }],
        },
      ]);

      await expect(service.getCourseCertificate(traineeId, courseId)).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it('throws ForbiddenError when a required task has no review status', async () => {
      repo.findRequiredTaskProgress.mockResolvedValue([
        requiredTasks[0],
        {
          ...requiredTasks[1],
          progress: [{ review_status: null }],
        },
      ]);

      await expect(service.getCourseCertificate(traineeId, courseId)).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it('throws ForbiddenError when a required task has no progress record', async () => {
      repo.findRequiredTaskProgress.mockResolvedValue([
        requiredTasks[0],
        {
          ...requiredTasks[1],
          progress: [],
        },
      ]);

      await expect(service.getCourseCertificate(traineeId, courseId)).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it('throws ForbiddenError when not every day is completed', async () => {
      repo.findCompletions.mockResolvedValue([completedDays[0]]);

      await expect(service.getCourseCertificate(traineeId, courseId)).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it('throws ForbiddenError when the course has no required tasks', async () => {
      repo.findRequiredTaskProgress.mockResolvedValue([]);

      await expect(service.getCourseCertificate(traineeId, courseId)).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it('uses the expected locked message when the course is not eligible', async () => {
      repo.findRequiredTaskProgress.mockResolvedValue([
        {
          ...requiredTasks[0],
          progress: [{ review_status: 'rework' }],
        },
        requiredTasks[1],
      ]);

      await expect(service.getCourseCertificate(traineeId, courseId)).rejects.toThrow(
        CERTIFICATE_LOCKED_MESSAGE
      );
    });

    it('throws NotFoundError when the trainee does not exist', async () => {
      repo.findTrainee.mockResolvedValue(null);

      await expect(service.getCourseCertificate(traineeId, courseId)).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('does not look up the trainee when the course is not eligible', async () => {
      repo.findRequiredTaskProgress.mockResolvedValue([
        {
          ...requiredTasks[0],
          progress: [{ review_status: 'rework' }],
        },
        requiredTasks[1],
      ]);

      await expect(service.getCourseCertificate(traineeId, courseId)).rejects.toBeInstanceOf(
        ForbiddenError
      );

      expect(repo.findTrainee).not.toHaveBeenCalled();
    });
  });
});
