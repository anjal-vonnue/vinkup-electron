import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagerStaffMember, ManagerTrainee } from '@itp/types';

const repo = vi.hoisted(() => ({
  listStaff: vi.fn(),
  listTraineesWithMentor: vi.fn(),
  assignMentor: vi.fn(),
  findStaffById: vi.fn(),
  findStaffByEmail: vi.fn(),
  findTraineeByEmail: vi.fn(),
  createStaff: vi.fn(),
  updateStaff: vi.fn(),
  setStaffActive: vi.fn(),
  countAssignedTrainees: vi.fn(),
  findAssignableMentor: vi.fn(),
  createTrainee: vi.fn(),
  findTraineeById: vi.fn(),
  updateTrainee: vi.fn(),
  setTraineeActive: vi.fn(),
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
import { realtimeBroker } from '../realtime-module/realtime.broker';

const MANAGER_ID = 'b5f9c5d1-2a44-4f4d-8a1e-6f2c9d7b3e55';
const MENTOR_ID = '9b1e4c2a-7d3f-4e8b-a1c5-2f6d8e0b4a77';
const TRAINEE_ID = '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11';

const trainee: ManagerTrainee = {
  id: TRAINEE_ID,
  name: 'Test Trainee',
  email: 'trainee@vonnue.com',
  isActive: true,
  mentor: { id: MENTOR_ID, name: 'Test Mentor', email: 'mentor@vonnue.com' },
};

const traineeRow = {
  id: TRAINEE_ID,
  name: 'Test Trainee',
  email: 'trainee@vonnue.com',
  is_active: true,
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
      traineeRow,
      {
        id: 't-unassigned',
        name: 'Unassigned',
        email: 'u@vonnue.com',
        is_active: true,
        mentor: null,
      },
    ]);

    await expect(service.listTrainees()).resolves.toEqual([
      trainee,
      {
        id: 't-unassigned',
        name: 'Unassigned',
        email: 'u@vonnue.com',
        isActive: true,
        mentor: null,
      },
    ]);
  });
});

describe('ManagerService.assignMentor', () => {
  it('assigns or reassigns a trainee to an active mentor', async () => {
    repo.assignMentor.mockResolvedValue({
      status: 'assigned',
      trainee: traineeRow,
      previousMentorId: null,
    });

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
      trainee: { ...traineeRow, mentor: null },
      previousMentorId: MENTOR_ID,
    });

    const result = await service.assignMentor(TRAINEE_ID, null, MANAGER_ID);

    expect(repo.assignMentor).toHaveBeenCalledWith(TRAINEE_ID, null);
    expect(result.mentor).toBeNull();
    expect(console.info).toHaveBeenCalledWith(
      `[manager] ${MANAGER_ID} unassigned trainee ${TRAINEE_ID}`
    );
  });

  it('tells both the previous and the new mentor about a reassignment', async () => {
    const previousMentorId = 'c6a0d6e2-3b55-4a5e-9b2f-7a3d0e8c4f66';
    repo.assignMentor.mockResolvedValue({
      status: 'assigned',
      trainee: traineeRow,
      previousMentorId,
    });
    const publish = vi.spyOn(realtimeBroker, 'publish');

    await service.assignMentor(TRAINEE_ID, MENTOR_ID, MANAGER_ID);

    expect(publish).toHaveBeenCalledTimes(2);
    const recipients = publish.mock.calls.map(([userId]) => userId);
    expect(recipients).toEqual(expect.arrayContaining([previousMentorId, MENTOR_ID]));
    for (const [, event] of publish.mock.calls) {
      expect(event).toMatchObject({
        type: 'trainee.reassigned',
        traineeId: TRAINEE_ID,
        traineeName: 'Test Trainee',
        previousMentorId,
        mentorId: MENTOR_ID,
      });
    }
    publish.mockRestore();
  });

  it('tells only the previous mentor when a trainee is unassigned', async () => {
    repo.assignMentor.mockResolvedValue({
      status: 'assigned',
      trainee: { ...traineeRow, mentor: null },
      previousMentorId: MENTOR_ID,
    });
    const publish = vi.spyOn(realtimeBroker, 'publish');

    await service.assignMentor(TRAINEE_ID, null, MANAGER_ID);

    expect(publish).toHaveBeenCalledWith(
      MENTOR_ID,
      expect.objectContaining({ type: 'trainee.reassigned', mentorId: null })
    );
    expect(publish).toHaveBeenCalledTimes(1);
    publish.mockRestore();
  });

  it('tells only the new mentor when a trainee had none', async () => {
    repo.assignMentor.mockResolvedValue({
      status: 'assigned',
      trainee: traineeRow,
      previousMentorId: null,
    });
    const publish = vi.spyOn(realtimeBroker, 'publish');

    await service.assignMentor(TRAINEE_ID, MENTOR_ID, MANAGER_ID);

    expect(publish).toHaveBeenCalledWith(
      MENTOR_ID,
      expect.objectContaining({ type: 'trainee.reassigned', previousMentorId: null })
    );
    expect(publish).toHaveBeenCalledTimes(1);
    publish.mockRestore();
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

const createdAt = new Date('2026-01-02T03:04:05.000Z');

function staffRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MENTOR_ID,
    name: 'Test Mentor',
    email: 'mentor@vonnue.com',
    role: 'MENTOR',
    is_active: true,
    created_at: createdAt,
    last_login_at: null,
    _count: { assigned_trainees: 0 },
    ...overrides,
  };
}

describe('ManagerService.createStaff', () => {
  it('creates a mentor account with a normalized name', async () => {
    repo.findStaffByEmail.mockResolvedValue(null);
    repo.findTraineeByEmail.mockResolvedValue(null);
    repo.createStaff.mockResolvedValue(staffRow());

    const result = await service.createStaff(
      { name: '  Test   Mentor ', email: 'mentor@vonnue.com', role: 'mentor' },
      MANAGER_ID
    );

    expect(repo.createStaff).toHaveBeenCalledWith({
      name: 'Test Mentor',
      email: 'mentor@vonnue.com',
      role: 'MENTOR',
    });
    expect(result).toMatchObject({ role: 'mentor', isActive: true });
    expect(console.info).toHaveBeenCalledWith(
      `[manager] ${MANAGER_ID} created mentor account ${MENTOR_ID}`
    );
  });

  it('creates a manager account', async () => {
    repo.findStaffByEmail.mockResolvedValue(null);
    repo.findTraineeByEmail.mockResolvedValue(null);
    repo.createStaff.mockResolvedValue(
      staffRow({ id: MANAGER_ID, role: 'MANAGER', email: 'manager@vonnue.com' })
    );

    await service.createStaff(
      { name: 'New Manager', email: 'manager@vonnue.com', role: 'manager' },
      MANAGER_ID
    );

    expect(repo.createStaff).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'MANAGER', email: 'manager@vonnue.com' })
    );
  });

  it('rejects a duplicate staff email', async () => {
    repo.findStaffByEmail.mockResolvedValue({ id: MENTOR_ID });
    repo.findTraineeByEmail.mockResolvedValue(null);

    await expect(
      service.createStaff(
        { name: 'Test Mentor', email: 'mentor@vonnue.com', role: 'mentor' },
        MANAGER_ID
      )
    ).rejects.toMatchObject({ statusCode: 409, code: 'STAFF_EXISTS' });
    expect(repo.createStaff).not.toHaveBeenCalled();
  });

  it('rejects an email that belongs to a trainee', async () => {
    repo.findStaffByEmail.mockResolvedValue(null);
    repo.findTraineeByEmail.mockResolvedValue({ id: TRAINEE_ID });

    await expect(
      service.createStaff(
        { name: 'Test Mentor', email: 'trainee@vonnue.com', role: 'mentor' },
        MANAGER_ID
      )
    ).rejects.toMatchObject({ statusCode: 409, code: 'TRAINEE_EXISTS' });
  });

  it('rejects an email outside the company domain', async () => {
    await expect(
      service.createStaff({ name: 'Outsider', email: 'x@example.com', role: 'mentor' }, MANAGER_ID)
    ).rejects.toMatchObject({ statusCode: 400, code: 'DOMAIN_NOT_PERMITTED' });
  });
});

describe('ManagerService.updateStaff', () => {
  it('updates name, email and role', async () => {
    repo.findStaffById.mockResolvedValue(staffRow());
    repo.findStaffByEmail.mockResolvedValue(null);
    repo.findTraineeByEmail.mockResolvedValue(null);
    repo.countAssignedTrainees.mockResolvedValue(0);
    repo.updateStaff.mockResolvedValue(
      staffRow({ name: 'Renamed', email: 'renamed@vonnue.com', role: 'MANAGER' })
    );

    await service.updateStaff(
      MENTOR_ID,
      { name: ' Renamed ', email: 'renamed@vonnue.com', role: 'manager' },
      MANAGER_ID
    );

    expect(repo.updateStaff).toHaveBeenCalledWith(MENTOR_ID, {
      name: 'Renamed',
      email: 'renamed@vonnue.com',
      role: 'MANAGER',
    });
  });

  it('returns 404 for an unknown account', async () => {
    repo.findStaffById.mockResolvedValue(null);

    await expect(
      service.updateStaff(MENTOR_ID, { name: 'Renamed' }, MANAGER_ID)
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('does not let a manager demote their own account', async () => {
    repo.findStaffById.mockResolvedValue(
      staffRow({ id: MANAGER_ID, role: 'MANAGER', email: 'manager@vonnue.com' })
    );

    await expect(
      service.updateStaff(MANAGER_ID, { role: 'mentor' }, MANAGER_ID)
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(repo.updateStaff).not.toHaveBeenCalled();
  });

  it('refuses to promote a mentor who still has trainees', async () => {
    repo.findStaffById.mockResolvedValue(staffRow());
    repo.countAssignedTrainees.mockResolvedValue(2);

    await expect(
      service.updateStaff(MENTOR_ID, { role: 'manager' }, MANAGER_ID)
    ).rejects.toMatchObject({ statusCode: 409, code: 'STAFF_HAS_TRAINEES' });
    expect(repo.updateStaff).not.toHaveBeenCalled();
  });

  it('rejects an email that belongs to another trainee', async () => {
    repo.findStaffById.mockResolvedValue(staffRow());
    repo.findStaffByEmail.mockResolvedValue(null);
    repo.findTraineeByEmail.mockResolvedValue({ id: TRAINEE_ID });

    await expect(
      service.updateStaff(MENTOR_ID, { email: 'trainee@vonnue.com' }, MANAGER_ID)
    ).rejects.toMatchObject({ statusCode: 409, code: 'TRAINEE_EXISTS' });
  });
});

describe('ManagerService.setStaffActive', () => {
  it('deactivates a mentor without assignments', async () => {
    repo.findStaffById.mockResolvedValue(staffRow());
    repo.countAssignedTrainees.mockResolvedValue(0);
    repo.setStaffActive.mockResolvedValue(staffRow({ is_active: false }));

    const result = await service.setStaffActive(MENTOR_ID, false, MANAGER_ID);

    expect(repo.setStaffActive).toHaveBeenCalledWith(MENTOR_ID, false);
    expect(result.isActive).toBe(false);
  });

  it('refuses to deactivate a mentor with assigned trainees', async () => {
    repo.findStaffById.mockResolvedValue(staffRow());
    repo.countAssignedTrainees.mockResolvedValue(1);

    await expect(service.setStaffActive(MENTOR_ID, false, MANAGER_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: 'STAFF_HAS_TRAINEES',
    });
    expect(repo.setStaffActive).not.toHaveBeenCalled();
  });

  it('does not let a manager deactivate themselves', async () => {
    await expect(service.setStaffActive(MANAGER_ID, false, MANAGER_ID)).rejects.toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    expect(repo.findStaffById).not.toHaveBeenCalled();
  });
});

describe('ManagerService.createTrainee', () => {
  it('creates an unassigned trainee', async () => {
    repo.findTraineeByEmail.mockResolvedValue(null);
    repo.findStaffByEmail.mockResolvedValue(null);
    repo.createTrainee.mockResolvedValue({
      id: TRAINEE_ID,
      name: 'New Trainee',
      email: 'new@vonnue.com',
      is_active: true,
      mentor: null,
    });

    const result = await service.createTrainee(
      { name: '  New   Trainee ', email: 'new@vonnue.com' },
      MANAGER_ID
    );

    expect(repo.findAssignableMentor).not.toHaveBeenCalled();
    expect(repo.createTrainee).toHaveBeenCalledWith({
      name: 'New Trainee',
      email: 'new@vonnue.com',
      mentorId: null,
    });
    expect(result).toMatchObject({ isActive: true, mentor: null });
  });

  it('assigns the new trainee to an active mentor', async () => {
    repo.findAssignableMentor.mockResolvedValue({ id: MENTOR_ID });
    repo.findTraineeByEmail.mockResolvedValue(null);
    repo.findStaffByEmail.mockResolvedValue(null);
    repo.createTrainee.mockResolvedValue(traineeRow);

    await service.createTrainee(
      { name: 'New Trainee', email: 'new@vonnue.com', mentorId: MENTOR_ID },
      MANAGER_ID
    );

    expect(repo.findAssignableMentor).toHaveBeenCalledWith(MENTOR_ID);
    expect(repo.createTrainee).toHaveBeenCalledWith(
      expect.objectContaining({ mentorId: MENTOR_ID })
    );
  });

  it('rejects an inactive or non-mentor target', async () => {
    repo.findAssignableMentor.mockResolvedValue(null);

    await expect(
      service.createTrainee(
        { name: 'New Trainee', email: 'new@vonnue.com', mentorId: MENTOR_ID },
        MANAGER_ID
      )
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_MENTOR' });
    expect(repo.createTrainee).not.toHaveBeenCalled();
  });

  it('rejects an email that belongs to a staff account', async () => {
    repo.findTraineeByEmail.mockResolvedValue(null);
    repo.findStaffByEmail.mockResolvedValue({ id: MENTOR_ID });

    await expect(
      service.createTrainee({ name: 'New Trainee', email: 'mentor@vonnue.com' }, MANAGER_ID)
    ).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_BELONGS_TO_ADMIN' });
  });
});

describe('ManagerService.updateTrainee', () => {
  it('updates the name and keeps the assignment', async () => {
    repo.findTraineeById.mockResolvedValue(traineeRow);
    repo.updateTrainee.mockResolvedValue({ ...traineeRow, name: 'Renamed Trainee' });

    const result = await service.updateTrainee(
      TRAINEE_ID,
      { name: ' Renamed   Trainee ' },
      MANAGER_ID
    );

    expect(repo.updateTrainee).toHaveBeenCalledWith(TRAINEE_ID, { name: 'Renamed Trainee' });
    expect(result.name).toBe('Renamed Trainee');
    expect(result.mentor).toEqual(trainee.mentor);
  });

  it('rejects a duplicate trainee email', async () => {
    repo.findTraineeById.mockResolvedValue(traineeRow);
    repo.findStaffByEmail.mockResolvedValue(null);
    repo.findTraineeByEmail.mockResolvedValue({ id: 'other-trainee' });

    await expect(
      service.updateTrainee(TRAINEE_ID, { email: 'other@vonnue.com' }, MANAGER_ID)
    ).rejects.toMatchObject({ statusCode: 409, code: 'TRAINEE_EXISTS' });
  });
});

describe('ManagerService.setTraineeActive', () => {
  it('deactivates a trainee without deleting their records', async () => {
    repo.findTraineeById.mockResolvedValue(traineeRow);
    repo.setTraineeActive.mockResolvedValue({ ...traineeRow, is_active: false });

    const result = await service.setTraineeActive(TRAINEE_ID, false, MANAGER_ID);

    expect(repo.setTraineeActive).toHaveBeenCalledWith(TRAINEE_ID, false);
    expect(result.isActive).toBe(false);
  });

  it('returns 404 for an unknown trainee', async () => {
    repo.findTraineeById.mockResolvedValue(null);

    await expect(service.setTraineeActive(TRAINEE_ID, false, MANAGER_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(repo.setTraineeActive).not.toHaveBeenCalled();
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
