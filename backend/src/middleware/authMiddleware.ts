import type { Request, Response, NextFunction } from 'express';
import { verifyJwt } from '../utils/jwt';
import { UnauthorizedError } from '../errors/AppError';
import type { AuthenticatedRequest } from '../types/auth.types';
import { AUTH_COOKIE_NAME } from '../module/auth-module/auth.constants';
import { ForbiddenError } from '../errors/AppError';
import { AuthRepository } from '../module/auth-module/auth.repository';

const authRepository = new AuthRepository();

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  try {
    const token = request.cookies?.[AUTH_COOKIE_NAME] as string | undefined;
    if (!token) {
      next(new UnauthorizedError('Not authenticated'));
      return;
    }
    (request as AuthenticatedRequest).user = verifyJwt(token);
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

/** Signed in as a trainee. Mentors and managers get 403 on trainee routes. */
export function requireTrainee(request: Request, response: Response, next: NextFunction) {
  requireAuth(request, response, (error?: unknown) => {
    if (error) return next(error);
    if ((request as AuthenticatedRequest).user.role !== 'trainee') {
      return next(new ForbiddenError('This page is for trainees.'));
    }
    next();
  });
}

/** Signed in as an active mentor (checked on every request). */
export function requireMentor(request: Request, response: Response, next: NextFunction) {
  requireAuth(request, response, (error?: unknown) => {
    if (error) return next(error);
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== 'mentor') return next(new ForbiddenError());
    authRepository
      .findActiveAdminById(user.id)
      .then((mentor) => (mentor ? next() : next(new ForbiddenError())))
      .catch(next);
  });
}

/** Signed in as an active manager (checked on every request). */
export function requireManager(request: Request, response: Response, next: NextFunction) {
  requireAuth(request, response, (error?: unknown) => {
    if (error) return next(error);
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== 'manager') return next(new ForbiddenError());
    authRepository
      .findActiveAdminById(user.id)
      .then((manager) => (manager ? next() : next(new ForbiddenError())))
      .catch(next);
  });
}

/**
 * Backward-compatible alias: historically "admin" meant the mentor/reviewer role.
 * New code should prefer requireMentor or requireManager.
 */
export const requireAdmin = requireMentor;
