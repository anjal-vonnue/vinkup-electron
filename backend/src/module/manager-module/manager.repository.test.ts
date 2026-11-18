import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  trainee: { findUnique: vi.fn(), update: vi.fn() },
  admin: { findUnique: vi.fn() },
}));

const prisma = vi.hoisted(() => ({
  admin: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  trainee: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
}));

vi.mock('../../lib/prisma', () => ({ prisma }));

import { ManagerRepository } from './manager.repository.js';

const MENTOR_ID = '9b1e4c2a-7d3f-4e8b-a1c5-2f6d8e0b4a77';
const TRAINEE_ID = '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11';
const row = {
  id: TRAINEE_ID,
  name: 'Test Trainee',
  email: 'trainee@vonnue.com',
  is_active: true,
  mentor: { id: MENTOR_ID, name: 'Test Mentor', email: 'mentor@vonnue.com' },
};

let repository: ManagerRepository;

beforeEach(() => {
  vi.clearAllMocks();
  repository = new ManagerRepository();
  tx.trainee.findUnique.mockResolvedValue({ id: TRAINEE_ID, mentor_id: null });
  tx.admin.findUnique.mockResolvedValue({ id: MENTOR_ID, role: 'MENTOR', is_active: true });
  tx.trainee.update.mockResolvedValue(row);
});

describe('ManagerRepository.assignMentor', () => {
  it('returns trainee-not-found without writing', async () => {
    tx.trainee.findUnique.mockResolvedValue(null);

    await expect(repository.assignMentor(TRAINEE_ID, MENTOR_ID)).resolves.toEqual({
      status: 'trainee-not-found',
    });
    expect(tx.trainee.update).not.toHaveBeenCalled();
  });

  it('unassigns with a null mentor without validating a mentor row', async () => {
    tx.trainee.update.mockResolvedValue({ ...row, mentor: null });

    await expect(repository.assignMentor(TRAINEE_ID, null)).resolves.toEqual({
      status: 'assigned',
      trainee: { ...row, mentor: null },
    });
    expect(tx.admin.findUnique).not.toHaveBeenCalled();
    expect(tx.trainee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TRAINEE_ID },
        data: { mentor_id: null },
      })
    );
  });

  it('returns mentor-not-found for an unknown target', async () => {
    tx.admin.findUnique.mockResolvedValue(null);

    await expect(repository.assignMentor(TRAINEE_ID, MENTOR_ID)).resolves.toEqual({
      status: 'mentor-not-found',
    });
    expect(tx.trainee.update).not.toHaveBeenCalled();
  });

  it.each([
    [{ id: MENTOR_ID, role: 'MANAGER', is_active: true }],
    [{ id: MENTOR_ID, role: 'MENTOR', is_active: false }],
  ])('rejects a target that is not an active mentor: %o', async (mentor) => {
    tx.admin.findUnique.mockResolvedValue(mentor);

    await expect(repository.assignMentor(TRAINEE_ID, MENTOR_ID)).resolves.toEqual({
      status: 'mentor-invalid',
    });
    expect(tx.trainee.update).not.toHaveBeenCalled();
  });

  it('rejects assigning the mentor the trainee already has', async () => {
    tx.trainee.findUnique.mockResolvedValue({ id: TRAINEE_ID, mentor_id: MENTOR_ID });

    await expect(repository.assignMentor(TRAINEE_ID, MENTOR_ID)).resolves.toEqual({
      status: 'already-assigned',
    });
    expect(tx.trainee.update).not.toHaveBeenCalled();
  });

  it('reassigns a trainee from another mentor', async () => {
    tx.trainee.findUnique.mockResolvedValue({
      id: TRAINEE_ID,
      mentor_id: 'c6a0d6e2-3b55-4a5e-9b2f-7a3d0e8c4f66',
    });

    await expect(repository.assignMentor(TRAINEE_ID, MENTOR_ID)).resolves.toEqual({
      status: 'assigned',
      trainee: row,
    });
    expect(tx.trainee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TRAINEE_ID },
        data: { mentor_id: MENTOR_ID },
      })
    );
  });
});

describe('ManagerRepository staff reads', () => {
  it('lists staff ordered by role then name, with assignment counts', async () => {
    prisma.admin.findMany.mockResolvedValue([]);

    await repository.listStaff();

    expect(prisma.admin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      })
    );
  });

  it('finds an assignable mentor by role and active flag', async () => {
    prisma.admin.findFirst.mockResolvedValue({ id: MENTOR_ID });

    await repository.findAssignableMentor(MENTOR_ID);

    expect(prisma.admin.findFirst).toHaveBeenCalledWith({
      where: { id: MENTOR_ID, role: 'MENTOR', is_active: true },
      select: { id: true },
    });
  });

  it('counts only trainees currently linked to a staff account', async () => {
    prisma.trainee.count.mockResolvedValue(2);

    await expect(repository.countAssignedTrainees(MENTOR_ID)).resolves.toBe(2);
    expect(prisma.trainee.count).toHaveBeenCalledWith({ where: { mentor_id: MENTOR_ID } });
  });
});

describe('ManagerRepository staff writes', () => {
  it('creates a staff account with the mapped database role', async () => {
    prisma.admin.create.mockResolvedValue({ id: MENTOR_ID });

    await repository.createStaff({
      name: 'New Mentor',
      email: 'new.mentor@vonnue.com',
      role: 'MENTOR',
    });

    expect(prisma.admin.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'New Mentor', email: 'new.mentor@vonnue.com', role: 'MENTOR' },
      })
    );
  });

  it('updates and activates a staff account', async () => {
    prisma.admin.update.mockResolvedValue({ id: MENTOR_ID });

    await repository.updateStaff(MENTOR_ID, { name: 'Renamed' });
    expect(prisma.admin.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MENTOR_ID },
        data: { name: 'Renamed' },
      })
    );

    await repository.setStaffActive(MENTOR_ID, false);
    expect(prisma.admin.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: MENTOR_ID },
        data: { is_active: false },
      })
    );
  });
});

describe('ManagerRepository trainee writes', () => {
  it('creates a trainee with an optional mentor link', async () => {
    prisma.trainee.create.mockResolvedValue(row);

    await repository.createTrainee({
      name: 'New Trainee',
      email: 'new.trainee@vonnue.com',
      mentorId: MENTOR_ID,
    });

    expect(prisma.trainee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: 'New Trainee',
          email: 'new.trainee@vonnue.com',
          mentor_id: MENTOR_ID,
        },
      })
    );
  });

  it('updates a trainee and their active flag', async () => {
    prisma.trainee.update.mockResolvedValue(row);

    await repository.updateTrainee(TRAINEE_ID, { name: 'Renamed' });
    expect(prisma.trainee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TRAINEE_ID },
        data: { name: 'Renamed' },
      })
    );

    await repository.setTraineeActive(TRAINEE_ID, false);
    expect(prisma.trainee.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: TRAINEE_ID },
        data: { is_active: false },
      })
    );
  });

  it('lists every trainee with their current mentor, ordered by name', async () => {
    prisma.trainee.findMany.mockResolvedValue([row]);

    await expect(repository.listTraineesWithMentor()).resolves.toEqual([row]);
    expect(prisma.trainee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' } })
    );
  });
});
