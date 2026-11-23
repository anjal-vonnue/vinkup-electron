import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminTraineeSummary } from '@itp/types';

const repo = vi.hoisted(() => ({
  findTraineeByEmail: vi.fn(),
  findAdminByEmail: vi.fn(),
  createTrainee: vi.fn(),
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
import { createTraineeSchema } from './admin.schema';

const ADMIN_ID = '9b1e4c2a-7d3f-4e8b-a1c5-2f6d8e0b4a77';

function row(overrides: Partial<AdminTraineeSummary> = {}): AdminTraineeSummary {
  return {
    id: 't-new',
    name: 'Asha Rao',
    email: 'asha.rao@vonnue.com',
    daysCompleted: 0,
    totalDays: 54,
    currentDay: { id: 'html-day-01', courseTitle: 'HTML', dayNumber: 1, title: 'Structure' },
    todayActiveSeconds: 0,
    totalActiveSeconds: 0,
    totalCodingSeconds: 0,
    lastActiveDate: null,
    latestWpm: null,
    flagsLast7Days: 0,
    averageScore: 0,
    daysScored: 0,
    pendingReviewItems: [],
    ...overrides,
  };
}

let service: AdminService;

beforeEach(() => {
  vi.clearAllMocks();
  repo.findTraineeByEmail.mockResolvedValue(null);
  repo.findAdminByEmail.mockResolvedValue(null);
  repo.createTrainee.mockResolvedValue({
    id: 't-new',
    name: 'Asha Rao',
    email: 'asha.rao@vonnue.com',
  });
  service = new AdminService();
  vi.spyOn(service, 'listTrainees').mockResolvedValue([row({ id: 't-old', name: 'Old' }), row()]);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

describe('AdminService.createTrainee', () => {
  it('creates the trainee and returns their list row', async () => {
    const result = await service.createTrainee(
      { name: 'Asha Rao', email: 'asha.rao@vonnue.com' },
      ADMIN_ID
    );

    expect(repo.createTrainee).toHaveBeenCalledWith({
      name: 'Asha Rao',
      email: 'asha.rao@vonnue.com',
      mentorId: ADMIN_ID,
    });
    expect(result).toEqual(row());
  });

  it('collapses repeated spaces in the name', async () => {
    await service.createTrainee({ name: 'Asha    Rao', email: 'asha.rao@vonnue.com' }, ADMIN_ID);

    expect(repo.createTrainee).toHaveBeenCalledWith({
      name: 'Asha Rao',
      email: 'asha.rao@vonnue.com',
      mentorId: ADMIN_ID,
    });
  });

  it('logs which admin added which trainee', async () => {
    await service.createTrainee({ name: 'Asha Rao', email: 'asha.rao@vonnue.com' }, ADMIN_ID);

    expect(console.info).toHaveBeenCalledWith(`[admin] ${ADMIN_ID} added trainee t-new`);
  });

  it.each(['asha@gmail.com', 'asha@vonnue.com.evil.com', 'asha@notvonnue.com'])(
    'rejects %s with 400 DOMAIN_NOT_PERMITTED before any database call',
    async (email) => {
      await expect(
        service.createTrainee({ name: 'Asha Rao', email }, ADMIN_ID)
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'DOMAIN_NOT_PERMITTED',
      });
      expect(repo.findTraineeByEmail).not.toHaveBeenCalled();
      expect(repo.createTrainee).not.toHaveBeenCalled();
    }
  );

  it('rejects an admin’s email with 409 EMAIL_BELONGS_TO_ADMIN', async () => {
    repo.findAdminByEmail.mockResolvedValue({ id: ADMIN_ID });

    await expect(
      service.createTrainee({ name: 'Mentor', email: 'mentor@vonnue.com' }, ADMIN_ID)
    ).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_BELONGS_TO_ADMIN' });
    expect(repo.createTrainee).not.toHaveBeenCalled();
  });

  it('rejects an existing trainee’s email with 409 TRAINEE_EXISTS', async () => {
    repo.findTraineeByEmail.mockResolvedValue({ id: 't-old' });

    await expect(
      service.createTrainee({ name: 'Asha Rao', email: 'asha.rao@vonnue.com' }, ADMIN_ID)
    ).rejects.toMatchObject({ statusCode: 409, code: 'TRAINEE_EXISTS' });
    expect(repo.createTrainee).not.toHaveBeenCalled();
  });

  it('turns a unique-constraint race into 409 TRAINEE_EXISTS', async () => {
    repo.createTrainee.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    );

    await expect(
      service.createTrainee({ name: 'Asha Rao', email: 'asha.rao@vonnue.com' }, ADMIN_ID)
    ).rejects.toMatchObject({ statusCode: 409, code: 'TRAINEE_EXISTS' });
  });

  it('lets other database errors through unchanged', async () => {
    const dbError = new Error('connection refused');
    repo.createTrainee.mockRejectedValue(dbError);

    await expect(
      service.createTrainee({ name: 'Asha Rao', email: 'asha.rao@vonnue.com' }, ADMIN_ID)
    ).rejects.toBe(dbError);
  });
});

describe('createTraineeSchema', () => {
  it('trims the name and trims + lower-cases the email', () => {
    const result = createTraineeSchema.parse({
      name: '  Asha Rao ',
      email: ' Asha.Rao@VONNUE.com ',
    });

    expect(result).toEqual({ name: 'Asha Rao', email: 'asha.rao@vonnue.com' });
  });

  it('drops unknown fields', () => {
    const result = createTraineeSchema.parse({ name: 'Asha Rao', email: 'a@vonnue.com', id: 'x' });

    expect(result).not.toHaveProperty('id');
  });

  it.each([
    [{ email: 'a@vonnue.com' }],
    [{ name: 'A', email: 'a@vonnue.com' }],
    [{ name: 'x'.repeat(81), email: 'a@vonnue.com' }],
    [{ name: 'Asha Rao', email: 'not-an-email' }],
    [{ name: 'Asha Rao' }],
  ])('rejects %o', (input) => {
    expect(createTraineeSchema.safeParse(input).success).toBe(false);
  });
});
