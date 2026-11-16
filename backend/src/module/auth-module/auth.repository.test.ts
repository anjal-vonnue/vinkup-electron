import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  trainee: {
    findFirst: vi.fn(),
  },
}));

vi.mock('../../lib/prisma', () => ({ prisma }));

import { AuthRepository } from './auth.repository';

const TRAINEE_ID = '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11';

beforeEach(() => {
  prisma.trainee.findFirst.mockReset();
});

describe('AuthRepository trainee lookups', () => {
  it('normalizes the email and only finds active trainees', async () => {
    prisma.trainee.findFirst.mockResolvedValue(null);

    await new AuthRepository().findBymail('Trainee@VONNUE.com');

    expect(prisma.trainee.findFirst).toHaveBeenCalledWith({
      where: { email: 'trainee@vonnue.com', is_active: true },
    });
  });

  it('only restores an active trainee session', async () => {
    prisma.trainee.findFirst.mockResolvedValue(null);

    await new AuthRepository().findById(TRAINEE_ID);

    expect(prisma.trainee.findFirst).toHaveBeenCalledWith({
      where: { id: TRAINEE_ID, is_active: true },
    });
  });

  it('returns null for a deactivated trainee', async () => {
    prisma.trainee.findFirst.mockResolvedValue(null);

    await expect(new AuthRepository().findById(TRAINEE_ID)).resolves.toBeNull();
  });

  it('checks the active flag on every trainee request', async () => {
    prisma.trainee.findFirst.mockResolvedValue({ id: TRAINEE_ID });

    await expect(new AuthRepository().findActiveTraineeById(TRAINEE_ID)).resolves.toEqual({
      id: TRAINEE_ID,
    });
    expect(prisma.trainee.findFirst).toHaveBeenCalledWith({
      where: { id: TRAINEE_ID, is_active: true },
      select: { id: true },
    });
  });
});
