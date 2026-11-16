import { ErrorCode } from '@itp/types';

export class AppError extends Error {
  statusCode: number;
  code: ErrorCode;
  details?: unknown;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

// General errors
export class ValidationError extends AppError {
  constructor(details: unknown) {
    super(400, 'VALIDATION_FAILED', 'Some fields are invalid.', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Please log in.') {
    super(401, 'UNAUTHENTICATED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have access to this.") {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found.') {
    super(404, 'NOT_FOUND', message);
  }
}

export class DomainNotPermittedError extends AppError {
  constructor() {
    super(403, 'DOMAIN_NOT_PERMITTED', 'This Google account is not on an approved domain.');
  }
}

export class NotProvisionedError extends AppError {
  constructor() {
    super(
      403,
      'NOT_PROVISIONED',
      'Your account has not been provisioned yet. Contact your administrator.'
    );
  }
}

export class DayLockedError extends AppError {
  constructor() {
    super(403, 'DAY_LOCKED', "This day isn't unlocked yet.");
  }
}

export class ChecklistIncompleteError extends AppError {
  constructor(completedTasks: number, requiredTasks: number) {
    super(403, 'CHECKLIST_INCOMPLETE', 'Complete all required tasks before submitting the day.', {
      completedTasks,
      requiredTasks,
    });
  }
}

/** 409: the request is valid but clashes with existing data. */
export class ConflictError extends AppError {
  constructor(
    code: Extract<
      ErrorCode,
      'TRAINEE_EXISTS' | 'EMAIL_BELONGS_TO_ADMIN' | 'ALREADY_REVIEWED' | 'ALREADY_APPROVED'
    >,
    message: string
  ) {
    super(409, code, message);
  }
}

/** 409: a review action on a task that has no submission waiting for review. */
export class TaskNotSubmittedError extends AppError {
  constructor() {
    super(
      409,
      'TASK_NOT_SUBMITTED',
      'This task has no submission waiting for review. The trainee has to submit it first.'
    );
  }
}

/** 400: an admin tried to add a trainee whose email is not on the company domain. */
export class TraineeDomainError extends AppError {
  constructor(domain: string) {
    super(400, 'DOMAIN_NOT_PERMITTED', `Use a company email address ending in @${domain}.`);
  }
}
