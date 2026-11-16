import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { signJwt, type JwtPayload } from '../utils/jwt';
import { AUTH_COOKIE_NAME } from '../module/auth-module/auth.constants';
import { AppError } from '../errors/AppError';
import type { AuthenticatedRequest } from '../types/auth.types';

const { findActiveStaffById } = vi.hoisted(() => ({ findActiveStaffById: vi.fn() }));

// Staff guards re-check the staff account on every request; no real database here.
vi.mock('../module/auth-module/auth.repository', () => ({
  AuthRepository: class {
    findActiveStaffById = findActiveStaffById;
  },
}));

import {
  requireAdmin,
  requireAuth,
  requireManager,
  requireMentor,
  requireTrainee,
} from './authMiddleware';

type Middleware = (req: Request, res: Response, next: NextFunction) => void;

const trainee: JwtPayload = {
  id: '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11',
  name: 'Test Trainee',
  email: 'trainee@vonnue.com',
  role: 'trainee',
};

const mentor: JwtPayload = {
  id: '9b1e4c2a-7d3f-4e8b-a1c5-2f6d8e0b4a77',
  name: 'Test Mentor',
  email: 'mentor@vonnue.com',
  role: 'mentor',
};

const manager: JwtPayload = {
  id: 'b5f9c5d1-2a44-4f4d-8a1e-6f2c9d7b3e55',
  name: 'Test Manager',
  email: 'manager@vonnue.com',
  role: 'manager',
};

/** A token issued before roles existed: no `role` claim. */
function legacyToken(): string {
  return jwt.sign({ id: trainee.id, name: trainee.name, email: trainee.email }, env.JWT_SECRET, {
    expiresIn: '1h',
  });
}

function requestWith(token?: string): Request {
  return { cookies: token ? { [AUTH_COOKIE_NAME]: token } : {} } as unknown as Request;
}

/** Runs a middleware and resolves with what it passed to next() (undefined = let through). */
function run(middleware: Middleware, req: Request): Promise<unknown> {
  return new Promise((resolve) => {
    middleware(req, {} as Response, ((error?: unknown) => resolve(error)) as NextFunction);
  });
}

function expectAppError(error: unknown, status: number, code: string): void {
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).statusCode).toBe(status);
  expect((error as AppError).code).toBe(code);
}

beforeEach(() => {
  findActiveStaffById.mockReset();
});

describe('requireAuth', () => {
  it('returns 401 with no cookie', async () => {
    expectAppError(await run(requireAuth, requestWith()), 401, 'UNAUTHENTICATED');
  });

  it('returns 401 for a malformed token', async () => {
    expectAppError(await run(requireAuth, requestWith('garbage')), 401, 'UNAUTHENTICATED');
  });

  it('lets a trainee through and sets req.user including the role', async () => {
    const req = requestWith(signJwt(trainee));

    expect(await run(requireAuth, req)).toBeUndefined();
    expect((req as AuthenticatedRequest).user).toEqual(trainee);
  });

  it('lets a mentor through (role checks are the job of the other guards)', async () => {
    const req = requestWith(signJwt(mentor));

    expect(await run(requireAuth, req)).toBeUndefined();
    expect((req as AuthenticatedRequest).user.role).toBe('mentor');
  });

  it('sets role "trainee" for a token issued before roles existed', async () => {
    const req = requestWith(legacyToken());

    expect(await run(requireAuth, req)).toBeUndefined();
    expect((req as AuthenticatedRequest).user.role).toBe('trainee');
  });
});

describe('requireTrainee', () => {
  it('lets a trainee through', async () => {
    expect(await run(requireTrainee, requestWith(signJwt(trainee)))).toBeUndefined();
  });

  it('lets a token issued before roles existed through', async () => {
    expect(await run(requireTrainee, requestWith(legacyToken()))).toBeUndefined();
  });

  it('returns 403 FORBIDDEN for a mentor', async () => {
    expectAppError(await run(requireTrainee, requestWith(signJwt(mentor))), 403, 'FORBIDDEN');
  });

  it('returns 401, not 403, when not signed in', async () => {
    expectAppError(await run(requireTrainee, requestWith()), 401, 'UNAUTHENTICATED');
  });

  it('never queries the admin table', async () => {
    await run(requireTrainee, requestWith(signJwt(mentor)));
    await run(requireTrainee, requestWith(signJwt(trainee)));

    expect(findActiveStaffById).not.toHaveBeenCalled();
  });
});

describe('requireMentor', () => {
  it('lets an active mentor through after checking the staff table', async () => {
    findActiveStaffById.mockResolvedValue({ id: mentor.id, role: 'MENTOR' });
    const req = requestWith(signJwt(mentor));

    expect(await run(requireMentor, req)).toBeUndefined();
    expect(findActiveStaffById).toHaveBeenCalledWith(mentor.id);
    expect((req as AuthenticatedRequest).user.role).toBe('mentor');
  });

  it('returns 403 when the mentor was deactivated after the token was issued', async () => {
    findActiveStaffById.mockResolvedValue(null);

    expectAppError(await run(requireMentor, requestWith(signJwt(mentor))), 403, 'FORBIDDEN');
  });

  it('returns 403 when the staff account has been promoted to manager', async () => {
    findActiveStaffById.mockResolvedValue({ id: mentor.id, role: 'MANAGER' });

    expectAppError(await run(requireMentor, requestWith(signJwt(mentor))), 403, 'FORBIDDEN');
  });

  it('returns 403 for a manager without querying the staff table', async () => {
    expectAppError(await run(requireMentor, requestWith(signJwt(manager))), 403, 'FORBIDDEN');
    expect(findActiveStaffById).not.toHaveBeenCalled();
  });

  it('returns 403 for a trainee without querying the staff table', async () => {
    expectAppError(await run(requireMentor, requestWith(signJwt(trainee))), 403, 'FORBIDDEN');
    expect(findActiveStaffById).not.toHaveBeenCalled();
  });

  it('returns 403 for a token issued before roles existed', async () => {
    expectAppError(await run(requireMentor, requestWith(legacyToken())), 403, 'FORBIDDEN');
  });

  it('returns 401 when not signed in', async () => {
    expectAppError(await run(requireMentor, requestWith()), 401, 'UNAUTHENTICATED');
    expect(findActiveStaffById).not.toHaveBeenCalled();
  });

  it('passes database errors on unchanged (the error handler turns them into 500)', async () => {
    const dbError = new Error('db down');
    findActiveStaffById.mockRejectedValue(dbError);

    expect(await run(requireMentor, requestWith(signJwt(mentor)))).toBe(dbError);
  });
});

describe('requireManager', () => {
  it('lets an active manager through after checking the staff table', async () => {
    findActiveStaffById.mockResolvedValue({ id: manager.id, role: 'MANAGER' });
    const req = requestWith(signJwt(manager));

    expect(await run(requireManager, req)).toBeUndefined();
    expect(findActiveStaffById).toHaveBeenCalledWith(manager.id);
  });

  it('returns 403 when the manager was deactivated after the token was issued', async () => {
    findActiveStaffById.mockResolvedValue(null);

    expectAppError(await run(requireManager, requestWith(signJwt(manager))), 403, 'FORBIDDEN');
  });

  it('returns 403 when the staff account has been demoted to mentor', async () => {
    findActiveStaffById.mockResolvedValue({ id: manager.id, role: 'MENTOR' });

    expectAppError(await run(requireManager, requestWith(signJwt(manager))), 403, 'FORBIDDEN');
  });

  it('returns 403 for a mentor without querying the staff table', async () => {
    expectAppError(await run(requireManager, requestWith(signJwt(mentor))), 403, 'FORBIDDEN');
    expect(findActiveStaffById).not.toHaveBeenCalled();
  });
});

describe('requireAdmin (backward-compatible alias)', () => {
  it('behaves like requireMentor', async () => {
    findActiveStaffById.mockResolvedValue({ id: mentor.id, role: 'MENTOR' });
    const req = requestWith(signJwt(mentor));

    expect(await run(requireAdmin, req)).toBeUndefined();
    expect(findActiveStaffById).toHaveBeenCalledWith(mentor.id);
  });

  it('rejects managers', async () => {
    expectAppError(await run(requireAdmin, requestWith(signJwt(manager))), 403, 'FORBIDDEN');
  });
});
