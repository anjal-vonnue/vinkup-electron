import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = vi.hoisted(() => ({
  trainee: { findUnique: vi.fn(), update: vi.fn() },
  admin: { findUnique: vi.fn() },
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}));

import { ManagerRepository } from './manager.repository';

const MENTOR_ID = '9b1e4c2a-7d3f-4e8b-a1c5-2f6d8e0b4a77';
const TRAINEE_ID = '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11';
const row = {
  id: TRAINEE_ID,
  name: 'Test Trainee',
  email: 'trainee@vonnue.com',
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
