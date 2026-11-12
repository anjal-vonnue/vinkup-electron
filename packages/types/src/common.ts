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
  | 'EMAIL_BELONGS_TO_ADMIN'
  | 'DESKTOP_AUTH_INVALID_STATE'
  | 'DESKTOP_AUTH_INVALID_PKCE'
  | 'DESKTOP_AUTH_INVALID_CODE'
  | 'DESKTOP_AUTH_EXPIRED'
  | 'DESKTOP_AUTH_CODE_USED'
  | 'DESKTOP_AUTH_CANCELLED'
  | 'DESKTOP_AUTH_FAILED'
  | 'DESKTOP_SESSION_EXPIRED'
  | 'DESKTOP_SESSION_REVOKED';

/** Every error response from the API looks exactly like this. */
export type ApiErrorResponse = {
  error: {
    code: ErrorCode;
    message: string; // safe to show to the trainee
    details?: unknown; // e.g. which fields failed validation
  };
};

export type UserRole = 'trainee' | 'admin';

// Response returned by the authenticated user profile endpoint
export type MeResponse = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};
