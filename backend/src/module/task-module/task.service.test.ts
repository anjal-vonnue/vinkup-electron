import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, DayLockedError, NotFoundError } from '../../errors/AppError';

const repo = vi.hoisted(() => ({
  findTask: vi.fn(),
  findStarterFiles: vi.fn(),
  findProgress: vi.fn(),
  findProgressStatus: vi.fn(),
  saveFiles: vi.fn(),
  markSubmitted: vi.fn(),
  findSubmissionContext: vi.fn(),
}));
const progress = vi.hoisted(() => ({
  assertTaskUnlocked: vi.fn(),
  taskStatus: vi.fn(),
}));
const notify = vi.hoisted(() => ({
  publishToMentor: vi.fn(),
}));
const slackRepo = vi.hoisted(() => ({
  createInTx: vi.fn(),
}));
const envMock = vi.hoisted(() => ({
  SLACK_ENABLED: false,
}));

vi.mock('./task.repository', () => ({
  TaskRepository: class {
    findTask = repo.findTask;
    findStarterFiles = repo.findStarterFiles;
    findProgress = repo.findProgress;
    findProgressStatus = repo.findProgressStatus;
    saveFiles = repo.saveFiles;
    markSubmitted = repo.markSubmitted;
    findSubmissionContext = repo.findSubmissionContext;
  },
}));

vi.mock('../progress-module/progress.service', () => ({
  ProgressService: class {
    assertTaskUnlocked = progress.assertTaskUnlocked;
    taskStatus = progress.taskStatus;
  },
}));

vi.mock('../realtime-module/realtime.notify', () => notify);

vi.mock('../slack-module/slack-notification.repository', () => ({
  SlackNotificationRepository: class {
    createInTx = slackRepo.createInTx;
  },
}));

vi.mock('../../config/env', () => ({
  env: envMock,
}));

import { TaskService } from './task.service';
import { realtimeBroker } from '../realtime-module/realtime.broker';

type SubmitCallback = (tx: unknown, progress: unknown) => Promise<void>;

const traineeId = 'trainee-1';
const taskId = 'html-day-01-t-1';
const STARTER = [{ path: 'index.html', content: '<!-- starter -->\n' }];
const SAVED = [{ path: 'index.html', content: '<h1>Me</h1>\n' }];

const taskRow = {
  id: taskId,
  title: 'Profile page',
  instructions_markdown: '## Task',
  is_stretch_goal: false,
  sequence_order: 1,
  estimated_minutes: 45,
  runtime: 'browser',
  run_command: null,
  setup_sql: null,
  curriculum_day: { id: 'html-day-01', day_number: 1, course: { title: 'HTML' } },
};

describe('TaskService', () => {
  let service: TaskService;

  beforeEach(() => {
    vi.clearAllMocks();
    envMock.SLACK_ENABLED = false;
    service = new TaskService();

    progress.assertTaskUnlocked.mockResolvedValue(undefined);
    progress.taskStatus.mockReturnValue('not_started');
    repo.findTask.mockResolvedValue(taskRow);
    repo.findStarterFiles.mockResolvedValue({ starter_files: STARTER });
    repo.findProgress.mockResolvedValue(null);
    repo.findProgressStatus.mockResolvedValue(null);
    repo.saveFiles.mockResolvedValue({});
    repo.markSubmitted.mockImplementation((_t: string, _id: string, submittedAt: Date) =>
      Promise.resolve({
        last_submitted_at: submittedAt,
        submission_count: 1,
        review_status: 'pending',
      })
    );
    repo.findSubmissionContext.mockResolvedValue({
      mentorId: null,
      mentorSlackChannelId: null,
      traineeName: 'Asha',
      taskTitle: 'Profile page',
      courseTitle: 'HTML & CSS',
      dayNumber: 1,
    });
  });

  describe('getTask', () => {
    it('maps the task, its day and the status from the progress rules', async () => {
      progress.taskStatus.mockReturnValue('in_progress');

      await expect(service.getTask(traineeId, taskId)).resolves.toEqual({
        id: taskId,
        title: 'Profile page',
        instructionsMarkdown: '## Task',
        isStretchGoal: false,
        sequenceOrder: 1,
        estimatedMinutes: 45,
        status: 'in_progress',
        reviewStatus: null,
        submissionCount: 0,
        day: { id: 'html-day-01', dayNumber: 1, courseTitle: 'HTML' },
        runtime: 'browser',
        runCommand: null,
        setupSql: null,
      });
      expect(repo.findProgress).toHaveBeenCalledWith(traineeId, taskId);
    });

    it('checks the lock before reading the task', async () => {
      progress.assertTaskUnlocked.mockRejectedValue(new DayLockedError());

      await expect(service.getTask(traineeId, taskId)).rejects.toBeInstanceOf(DayLockedError);
      expect(repo.findTask).not.toHaveBeenCalled();
    });
  });

  describe('getCode', () => {
    it('returns the starter files with updatedAt null before the first save', async () => {
      await expect(service.getCode(traineeId, taskId)).resolves.toEqual({
        files: STARTER,
        updatedAt: null,
      });
    });

    it('returns the starter files when the task was submitted without a save', async () => {
      repo.findProgress.mockResolvedValue({ files: null, code_updated_at: null });

      await expect(service.getCode(traineeId, taskId)).resolves.toEqual({
        files: STARTER,
        updatedAt: null,
      });
    });

    it('returns the saved files and the save time', async () => {
      const savedAt = new Date('2026-10-01T06:41:10.000Z');
      repo.findProgress.mockResolvedValue({ files: SAVED, code_updated_at: savedAt });

      await expect(service.getCode(traineeId, taskId)).resolves.toEqual({
        files: SAVED,
        updatedAt: '2026-10-01T06:41:10.000Z',
      });
      expect(repo.findStarterFiles).not.toHaveBeenCalled();
    });

    it('returns an empty list when the trainee saved no files', async () => {
      repo.findProgress.mockResolvedValue({ files: [], code_updated_at: new Date() });

      const code = await service.getCode(traineeId, taskId);
      expect(code.files).toEqual([]);
    });

    it('throws NotFoundError if the task disappears', async () => {
      repo.findStarterFiles.mockResolvedValue(null);

      await expect(service.getCode(traineeId, taskId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('saveCode', () => {
    it("saves the whole file set for the logged-in trainee's row", async () => {
      await service.saveCode(traineeId, taskId, SAVED);

      expect(repo.saveFiles).toHaveBeenCalledWith(traineeId, taskId, SAVED, expect.any(Date));
    });

    it('saves nothing for a locked task', async () => {
      progress.assertTaskUnlocked.mockRejectedValue(new DayLockedError());

      await expect(service.saveCode(traineeId, taskId, SAVED)).rejects.toBeInstanceOf(
        DayLockedError
      );
      expect(repo.saveFiles).not.toHaveBeenCalled();
    });

    it('tells the mentor when the first save moves the task to In progress', async () => {
      await service.saveCode(traineeId, taskId, SAVED);

      expect(notify.publishToMentor).toHaveBeenCalledWith(
        traineeId,
        expect.objectContaining({
          type: 'task.started',
          traineeId,
          taskId,
        })
      );
    });

    it('does not notify again on later autosaves', async () => {
      repo.findProgressStatus.mockResolvedValue({ status: 'in_progress' });

      await service.saveCode(traineeId, taskId, SAVED);

      expect(repo.saveFiles).toHaveBeenCalledTimes(1);
      expect(notify.publishToMentor).not.toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    const submittedAt = new Date();

    beforeEach(() => {
      repo.markSubmitted.mockImplementation(() =>
        Promise.resolve({
          last_submitted_at: submittedAt,
          review_status: 'pending',
          submission_count: 1,
        })
      );
    });

    it('marks the task completed and returns the submit time and new attempt', async () => {
      const result = await service.submit(traineeId, taskId);

      expect(result).toEqual({
        status: 'completed',
        submittedAt: submittedAt.toISOString(),
        reviewStatus: 'pending',
        submissionCount: 1,
      });
      expect(repo.markSubmitted).toHaveBeenCalledWith(
        traineeId,
        taskId,
        expect.any(Date),
        expect.any(Function)
      );
    });

    it('rejects an approved task with a 409 without reading the row first', async () => {
      repo.markSubmitted.mockResolvedValue(null);

      await expect(service.submit(traineeId, taskId)).rejects.toBeInstanceOf(ConflictError);
      await expect(service.submit(traineeId, taskId)).rejects.toMatchObject({
        code: 'ALREADY_APPROVED',
      });
    });

    it('leaves keeping the first submit time to the repository, without reading the row first', async () => {
      await service.submit(traineeId, taskId);

      expect(repo.findProgress).not.toHaveBeenCalled();
      expect(repo.markSubmitted).toHaveBeenCalledTimes(1);
    });

    it('tells the assigned mentor who submitted which task', async () => {
      repo.findSubmissionContext.mockResolvedValue({
        mentorId: 'mentor-1',
        mentorSlackChannelId: null,
        traineeName: 'Asha',
        taskTitle: 'Profile page',
        courseTitle: 'HTML & CSS',
        dayNumber: 1,
      });
      const publish = vi.spyOn(realtimeBroker, 'publish');

      await service.submit(traineeId, taskId);

      expect(publish).toHaveBeenCalledWith(
        'mentor-1',
        expect.objectContaining({
          type: 'task.submitted',
          traineeId,
          traineeName: 'Asha',
          taskId,
          taskTitle: 'Profile page',
          submissionCount: 1,
        })
      );
      publish.mockRestore();
    });

    it('sends nothing when the trainee has no mentor assigned', async () => {
      const publish = vi.spyOn(realtimeBroker, 'publish');

      await service.submit(traineeId, taskId);

      expect(publish).not.toHaveBeenCalled();
      publish.mockRestore();
    });

    it('saves nothing for a task that does not exist', async () => {
      progress.assertTaskUnlocked.mockRejectedValue(new NotFoundError('Task not found.'));

      await expect(service.submit(traineeId, taskId)).rejects.toBeInstanceOf(NotFoundError);
      expect(repo.markSubmitted).not.toHaveBeenCalled();
    });

    it('queues a Slack notification for the assigned mentor channel in the submission transaction', async () => {
      envMock.SLACK_ENABLED = true;
      const tx = {
        trainee: {
          findUnique: vi.fn().mockResolvedValue({
            name: 'Asha',
            mentor_id: 'mentor-1',
            mentor: { slack_channel_id: 'C0123ABCDEF' },
          }),
        },
        task: {
          findUnique: vi.fn().mockResolvedValue({
            title: 'Profile page',
            curriculum_day: { day_number: 1, course: { title: 'HTML & CSS' } },
          }),
        },
      };
      repo.markSubmitted.mockImplementation(
        async (_t: string, _id: string, submittedAt: Date, onSubmitted?: SubmitCallback) => {
          const progressRow = {
            last_submitted_at: submittedAt,
            submission_count: 2,
            review_status: 'pending',
          };
          if (onSubmitted) await onSubmitted(tx, progressRow);
          return progressRow;
        }
      );

      await service.submit(traineeId, taskId);

      const [passedTx, passedInput] = slackRepo.createInTx.mock.calls[0] as [
        unknown,
        {
          eventType: string;
          channelId: string;
          dedupeKey: string;
          payload: Record<string, unknown>;
        },
      ];
      expect(passedTx).toBe(tx);
      expect(passedInput.eventType).toBe('task.submission');
      expect(passedInput.channelId).toBe('C0123ABCDEF');
      expect(passedInput.dedupeKey).toBe(`task_submission:${traineeId}:${taskId}:2`);
      expect(passedInput.payload).toMatchObject({
        traineeName: 'Asha',
        taskTitle: 'Profile page',
        courseTitle: 'HTML & CSS',
        dayNumber: 1,
        submissionCount: 2,
        reviewStatus: 'pending',
      });
    });

    it('does not queue Slack notification when mentor has no channel', async () => {
      envMock.SLACK_ENABLED = true;
      const tx = {
        trainee: {
          findUnique: vi.fn().mockResolvedValue({
            name: 'Asha',
            mentor_id: 'mentor-1',
            mentor: { slack_channel_id: null },
          }),
        },
        task: {
          findUnique: vi.fn().mockResolvedValue({
            title: 'Profile page',
            curriculum_day: { day_number: 1, course: { title: 'HTML & CSS' } },
          }),
        },
      };
      repo.markSubmitted.mockImplementation(
        async (_t: string, _id: string, submittedAt: Date, onSubmitted?: SubmitCallback) => {
          const progressRow = {
            last_submitted_at: submittedAt,
            submission_count: 1,
            review_status: 'pending',
          };
          if (onSubmitted) await onSubmitted(tx, progressRow);
          return progressRow;
        }
      );

      await service.submit(traineeId, taskId);
      expect(slackRepo.createInTx).not.toHaveBeenCalled();
    });

    it('does not queue Slack notification when Slack is disabled', async () => {
      envMock.SLACK_ENABLED = false;
      const tx = {
        trainee: {
          findUnique: vi.fn().mockResolvedValue({
            name: 'Asha',
            mentor_id: 'mentor-1',
            mentor: { slack_channel_id: 'C0123ABCDEF' },
          }),
        },
        task: {
          findUnique: vi.fn().mockResolvedValue({
            title: 'Profile page',
            curriculum_day: { day_number: 1, course: { title: 'HTML & CSS' } },
          }),
        },
      };
      repo.markSubmitted.mockImplementation(
        async (_t: string, _id: string, submittedAt: Date, onSubmitted?: SubmitCallback) => {
          const progressRow = {
            last_submitted_at: submittedAt,
            submission_count: 1,
            review_status: 'pending',
          };
          if (onSubmitted) await onSubmitted(tx, progressRow);
          return progressRow;
        }
      );

      await service.submit(traineeId, taskId);
      expect(slackRepo.createInTx).not.toHaveBeenCalled();
    });

    it('fails submission when outbox persistence fails (same transaction)', async () => {
      envMock.SLACK_ENABLED = true;
      const tx = {
        trainee: {
          findUnique: vi.fn().mockResolvedValue({
            name: 'Asha',
            mentor_id: 'mentor-1',
            mentor: { slack_channel_id: 'C0123ABCDEF' },
          }),
        },
        task: {
          findUnique: vi.fn().mockResolvedValue({
            title: 'Profile page',
            curriculum_day: { day_number: 1, course: { title: 'HTML & CSS' } },
          }),
        },
      };
      slackRepo.createInTx.mockRejectedValue(new Error('db write failed'));
      repo.markSubmitted.mockImplementation(
        async (_t: string, _id: string, submittedAt: Date, onSubmitted?: SubmitCallback) => {
          const progressRow = {
            last_submitted_at: submittedAt,
            submission_count: 1,
            review_status: 'pending',
          };
          if (onSubmitted) await onSubmitted(tx, progressRow);
          return progressRow;
        }
      );

      await expect(service.submit(traineeId, taskId)).rejects.toThrow('db write failed');
    });

    it('ignores duplicate outbox events without failing submission', async () => {
      envMock.SLACK_ENABLED = true;
      const tx = {
        trainee: {
          findUnique: vi.fn().mockResolvedValue({
            name: 'Asha',
            mentor_id: 'mentor-1',
            mentor: { slack_channel_id: 'C0123ABCDEF' },
          }),
        },
        task: {
          findUnique: vi.fn().mockResolvedValue({
            title: 'Profile page',
            curriculum_day: { day_number: 1, course: { title: 'HTML & CSS' } },
          }),
        },
      };
      slackRepo.createInTx.mockRejectedValue({ code: 'P2002' });
      repo.markSubmitted.mockImplementation(
        async (_t: string, _id: string, submittedAt: Date, onSubmitted?: SubmitCallback) => {
          const progressRow = {
            last_submitted_at: submittedAt,
            submission_count: 1,
            review_status: 'pending',
          };
          if (onSubmitted) await onSubmitted(tx, progressRow);
          return progressRow;
        }
      );

      await expect(service.submit(traineeId, taskId)).resolves.toMatchObject({
        status: 'completed',
      });
    });
  });
});
