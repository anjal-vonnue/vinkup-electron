import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagerStaffMember, ManagerTrainee } from '@itp/types';

const repo = vi.hoisted(() => ({
  listStaff: vi.fn(),
  listTraineesWithMentor: vi.fn(),
  assignMentor: vi.fn(),
}));

vi.mock('./manager.repository', () => ({
  ManagerRepository: class {
    constructor() {
      Object.assign(this, repo);
    }
  },
}));

import { ManagerService } from './manager.service';
import { assignMentorSchema } from './manager.schema';

const MANAGER_ID = 'b5f9c5d1-2a44-4f4d-8a1e-6f2c9d7b3e55';
const MENTOR_ID = '9b1e4c2a-7d3f-4e8b-a1c5-2f6d8e0b4a77';
const TRAINEE_ID = '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11';

const trainee: ManagerTrainee = {
  id: TRAINEE_ID,
  name: 'Test Trainee',
  email: 'trainee@vonnue.com',
  mentor: { id: MENTOR_ID, name: 'Test Mentor', email: 'mentor@vonnue.com' },
};

let service: ManagerService;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  service = new ManagerService();
});

describe('ManagerService.listStaff', () => {
  it('maps database staff roles and assignment counts', async () => {
    const createdAt = new Date('2026-01-02T03:04:05.000Z');
    const lastLoginAt = new Date('2026-02-03T04:05:06.000Z');
    repo.listStaff.mockResolvedValue([
      {
        id: MENTOR_ID,
        name: 'Test Mentor',
        email: 'mentor@vonnue.com',
        role: 'MENTOR',
        is_active: true,
        created_at: createdAt,
        last_login_at: lastLoginAt,
        _count: { assigned_trainees: 3 },
      },
      {
        id: MANAGER_ID,
        name: 'Test Manager',
        email: 'manager@vonnue.com',
        role: 'MANAGER',
        is_active: false,
        created_at: createdAt,
        last_login_at: null,
        _count: { assigned_trainees: 0 },
      },
    ]);

    const result = await service.listStaff();

    expect(result).toEqual<ManagerStaffMember[]>([
      {
        id: MENTOR_ID,
        name: 'Test Mentor',
        email: 'mentor@vonnue.com',
        role: 'mentor',
        isActive: true,
        assignedTraineeCount: 3,
        createdAt: createdAt.toISOString(),
        lastLoginAt: lastLoginAt.toISOString(),
      },
      {
        id: MANAGER_ID,
        name: 'Test Manager',
        email: 'manager@vonnue.com',
        role: 'manager',
        isActive: false,
        assignedTraineeCount: 0,
        createdAt: createdAt.toISOString(),
        lastLoginAt: null,
      },
    ]);
  });
});

describe('ManagerService.listTrainees', () => {
  it('returns every trainee with their current mentor or null', async () => {
    repo.listTraineesWithMentor.mockResolvedValue([
      trainee,
      { id: 't-unassigned', name: 'Unassigned', email: 'u@vonnue.com', mentor: null },
    ]);

    await expect(service.listTrainees()).resolves.toEqual([
      trainee,
      { id: 't-unassigned', name: 'Unassigned', email: 'u@vonnue.com', mentor: null },
    ]);
  });
});

describe('ManagerService.assignMentor', () => {
  it('assigns or reassigns a trainee to an active mentor', async () => {
    repo.assignMentor.mockResolvedValue({ status: 'assigned', trainee });

    const result = await service.assignMentor(TRAINEE_ID, MENTOR_ID, MANAGER_ID);

    expect(repo.assignMentor).toHaveBeenCalledWith(TRAINEE_ID, MENTOR_ID);
    expect(result).toEqual(trainee);
    expect(console.info).toHaveBeenCalledWith(
      `[manager] ${MANAGER_ID} assigned trainee ${TRAINEE_ID} to mentor ${MENTOR_ID}`
    );
  });

  it('unassigns a trainee with a null mentor id', async () => {
    repo.assignMentor.mockResolvedValue({
      status: 'assigned',
      trainee: { ...trainee, mentor: null },
    });

    const result = await service.assignMentor(TRAINEE_ID, null, MANAGER_ID);

    expect(repo.assignMentor).toHaveBeenCalledWith(TRAINEE_ID, null);
    expect(result.mentor).toBeNull();
    expect(console.info).toHaveBeenCalledWith(
      `[manager] ${MANAGER_ID} unassigned trainee ${TRAINEE_ID}`
    );
  });

  it('returns 404 when the trainee does not exist', async () => {
    repo.assignMentor.mockResolvedValue({ status: 'trainee-not-found' });

    await expect(service.assignMentor(TRAINEE_ID, MENTOR_ID, MANAGER_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it('returns 404 when the mentor does not exist', async () => {
    repo.assignMentor.mockResolvedValue({ status: 'mentor-not-found' });

    await expect(service.assignMentor(TRAINEE_ID, MENTOR_ID, MANAGER_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  });

  it.each(['inactive', 'manager', 'trainee'])(
    'returns 400 INVALID_MENTOR for a %s target',
    async () => {
      repo.assignMentor.mockResolvedValue({ status: 'mentor-invalid' });

      await expect(service.assignMentor(TRAINEE_ID, MENTOR_ID, MANAGER_ID)).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_MENTOR',
      });
    }
  );

  it('returns 409 ALREADY_ASSIGNED when the trainee already has this mentor', async () => {
    repo.assignMentor.mockResolvedValue({ status: 'already-assigned' });

    await expect(service.assignMentor(TRAINEE_ID, MENTOR_ID, MANAGER_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: 'ALREADY_ASSIGNED',
    });
    expect(console.info).not.toHaveBeenCalled();
  });
});

describe('assignMentorSchema', () => {
  it('accepts a mentor UUID or null', () => {
    expect(assignMentorSchema.parse({ mentorId: MENTOR_ID })).toEqual({ mentorId: MENTOR_ID });
    expect(assignMentorSchema.parse({ mentorId: null })).toEqual({ mentorId: null });
  });

  it.each([{}, { mentorId: 'not-a-uuid' }, { mentorId: 42 }, { mentorId: undefined }])(
    'rejects %o',
    (body) => {
      expect(assignMentorSchema.safeParse(body).success).toBe(false);
    }
  );
});
