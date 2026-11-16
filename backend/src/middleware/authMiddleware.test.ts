import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { signJwt, type JwtPayload } from '../utils/jwt';
import { AUTH_COOKIE_NAME } from '../module/auth-module/auth.constants';
import { AppError } from '../errors/AppError';
import type { AuthenticatedRequest } from '../types/auth.types';

const { findActiveAdminById } = vi.hoisted(() => ({ findActiveAdminById: vi.fn() }));

// requireAdmin re-checks the admin table on every request; no real database here.
vi.mock('../module/auth-module/auth.repository', () => ({
  AuthRepository: class {
    findActiveAdminById = findActiveAdminById;
  },
}));

import { requireAdmin, requireAuth, requireTrainee } from './authMiddleware';

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
  findActiveAdminById.mockReset();
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

    expect(findActiveAdminById).not.toHaveBeenCalled();
  });
});

describe('requireAdmin', () => {
  it('lets an active mentor through after checking the admin table', async () => {
    findActiveAdminById.mockResolvedValue({ id: mentor.id });
    const req = requestWith(signJwt(mentor));

    expect(await run(requireAdmin, req)).toBeUndefined();
    expect(findActiveAdminById).toHaveBeenCalledWith(mentor.id);
    expect((req as AuthenticatedRequest).user.role).toBe('mentor');
  });

  it('returns 403 when the mentor was deactivated after the token was issued', async () => {
    findActiveAdminById.mockResolvedValue(null);

    expectAppError(await run(requireAdmin, requestWith(signJwt(mentor))), 403, 'FORBIDDEN');
  });

  it('returns 403 for a trainee without querying the admin table', async () => {
    expectAppError(await run(requireAdmin, requestWith(signJwt(trainee))), 403, 'FORBIDDEN');
    expect(findActiveAdminById).not.toHaveBeenCalled();
  });

  it('returns 403 for a token issued before roles existed', async () => {
    expectAppError(await run(requireAdmin, requestWith(legacyToken())), 403, 'FORBIDDEN');
  });

  it('returns 401 when not signed in', async () => {
    expectAppError(await run(requireAdmin, requestWith()), 401, 'UNAUTHENTICATED');
    expect(findActiveAdminById).not.toHaveBeenCalled();
  });

  it('passes database errors on unchanged (the error handler turns them into 500)', async () => {
    const dbError = new Error('db down');
    findActiveAdminById.mockRejectedValue(dbError);

    expect(await run(requireAdmin, requestWith(signJwt(mentor)))).toBe(dbError);
  });
});
