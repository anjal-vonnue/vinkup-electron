import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, DayLockedError, NotFoundError } from '../../errors/AppError';

const repo = vi.hoisted(() => ({
  findTask: vi.fn(),
  findStarterFiles: vi.fn(),
  findProgress: vi.fn(),
  saveFiles: vi.fn(),
  markSubmitted: vi.fn(),
}));
const progress = vi.hoisted(() => ({
  assertTaskUnlocked: vi.fn(),
  taskStatus: vi.fn(),
}));

vi.mock('./task.repository', () => ({
  TaskRepository: class {
    findTask = repo.findTask;
    findStarterFiles = repo.findStarterFiles;
    findProgress = repo.findProgress;
    saveFiles = repo.saveFiles;
    markSubmitted = repo.markSubmitted;
  },
}));

vi.mock('../progress-module/progress.service', () => ({
  ProgressService: class {
    assertTaskUnlocked = progress.assertTaskUnlocked;
    taskStatus = progress.taskStatus;
  },
}));

import { TaskService } from './task.service';

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
    service = new TaskService();

    progress.assertTaskUnlocked.mockResolvedValue(undefined);
    progress.taskStatus.mockReturnValue('not_started');
    repo.findTask.mockResolvedValue(taskRow);
    repo.findStarterFiles.mockResolvedValue({ starter_files: STARTER });
    repo.findProgress.mockResolvedValue(null);
    repo.saveFiles.mockResolvedValue({});
    repo.markSubmitted.mockImplementation((_t: string, _id: string, submittedAt: Date) =>
      Promise.resolve({ last_submitted_at: submittedAt })
    );
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
      expect(repo.markSubmitted).toHaveBeenCalledWith(traineeId, taskId, expect.any(Date));
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

    it('saves nothing for a task that does not exist', async () => {
      progress.assertTaskUnlocked.mockRejectedValue(new NotFoundError('Task not found.'));

      await expect(service.submit(traineeId, taskId)).rejects.toBeInstanceOf(NotFoundError);
      expect(repo.markSubmitted).not.toHaveBeenCalled();
    });
  });
});
