export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'
  | 'DAY_LOCKED'
  | 'CHECKLIST_INCOMPLETE'
  | 'DOMAIN_NOT_PERMITTED'
  | 'NOT_PROVISIONED'
  | 'TRAINEE_EXISTS'
  | 'STAFF_EXISTS'
  | 'STAFF_HAS_TRAINEES'
  | 'EMAIL_BELONGS_TO_ADMIN'
  | 'TASK_NOT_SUBMITTED'
  | 'ALREADY_REVIEWED'
  | 'ALREADY_APPROVED'
  | 'ALREADY_ASSIGNED'
  | 'INVALID_MENTOR'
  | 'DESKTOP_AUTH_INVALID_STATE'
  | 'DESKTOP_AUTH_INVALID_PKCE'
  | 'DESKTOP_AUTH_INVALID_CODE'
  | 'DESKTOP_AUTH_EXPIRED'
  | 'DESKTOP_AUTH_CODE_USED'
  | 'DESKTOP_AUTH_CANCELLED'
  | 'DESKTOP_AUTH_FAILED'
  | 'DESKTOP_SESSION_EXPIRED'
  | 'DESKTOP_SESSION_REVOKED'
  | 'CHECKPOINT_NOT_FOUND'
  | 'CHECKPOINT_NOT_ASSIGNED'
  | 'CHECKPOINT_NOT_AVAILABLE'
  | 'CHECKPOINT_ACTIVE'
  | 'CHECKPOINT_EXPIRED'
  | 'CHECKPOINT_ATTEMPT_FINALIZED'
  | 'CHECKPOINT_ATTEMPT_LIMIT_REACHED'
  | 'CHECKPOINT_EARLY_SUBMISSION_DISABLED'
  | 'CHECKPOINT_RESULTS_NOT_READY'
  | 'RATE_LIMITED'
  | 'PROMPT_NAME_TAKEN';

/** Every error response from the API looks exactly like this. */
export type ApiErrorResponse = {
  error: {
    code: ErrorCode;
    message: string; // safe to show to the trainee
    details?: unknown; // e.g. which fields failed validation
  };
};

export type UserRole = 'trainee' | 'mentor' | 'manager';

// Response returned by the authenticated user profile endpoint
export type MeResponse = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};
