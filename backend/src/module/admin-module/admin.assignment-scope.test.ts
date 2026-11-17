import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
  listTrainees: vi.fn(),
  listDaysInOrder: vi.fn(),
  listCompletions: vi.fn(),
  activityTotals: vi.fn(),
  activityForDate: vi.fn(),
  latestTypingResults: vi.fn(),
  flagCountsSince: vi.fn(),
  findStartedTasks: vi.fn(),
  findFlagEvents: vi.fn(),
}));

vi.mock('./admin.repository', () => ({
  AdminRepository: class {
    constructor() {
      Object.assign(this, repo);
    }
  },
}));
vi.mock('../profile-module/profile.service', () => ({ ProfileService: class {} }));
vi.mock('../progress-module/progress.service', () => ({ ProgressService: class {} }));

import { AdminService } from './admin.service';

const MENTOR_ID = '9b1e4c2a-7d3f-4e8b-a1c5-2f6d8e0b4a77';
const TRAINEE_ID = '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11';

beforeEach(() => {
  vi.clearAllMocks();
  repo.listTrainees.mockResolvedValue([
    { id: TRAINEE_ID, name: 'Test Trainee', email: 'trainee@vonnue.com' },
  ]);
  repo.listDaysInOrder.mockResolvedValue([]);
  repo.listCompletions.mockResolvedValue([]);
  repo.activityTotals.mockResolvedValue([]);
  repo.activityForDate.mockResolvedValue([]);
  repo.latestTypingResults.mockResolvedValue([]);
  repo.flagCountsSince.mockResolvedValue([]);
  repo.findStartedTasks.mockResolvedValue([]);
  repo.findFlagEvents.mockResolvedValue([]);
});

describe('AdminService.listTrainees assignment scope', () => {
  it('queries only the signed-in mentor’s trainees', async () => {
    const service = new AdminService();

    const result = await service.listTrainees(MENTOR_ID);

    expect(repo.listTrainees).toHaveBeenCalledWith(MENTOR_ID);
    expect(result.map((row) => row.id)).toEqual([TRAINEE_ID]);
  });

  it('scopes every roster aggregate to those trainee ids', async () => {
    const service = new AdminService();

    await service.listTrainees(MENTOR_ID);

    expect(repo.listCompletions).toHaveBeenCalledWith([TRAINEE_ID]);
    expect(repo.activityTotals).toHaveBeenCalledWith([TRAINEE_ID]);
    expect(repo.activityForDate).toHaveBeenCalledWith(expect.any(Date), [TRAINEE_ID]);
    expect(repo.latestTypingResults).toHaveBeenCalledWith([TRAINEE_ID]);
    expect(repo.flagCountsSince).toHaveBeenCalledWith(expect.any(Date), [TRAINEE_ID]);
    expect(repo.findStartedTasks).toHaveBeenCalledWith([TRAINEE_ID]);
    expect(repo.findFlagEvents).toHaveBeenCalledWith([TRAINEE_ID]);
  });
});
