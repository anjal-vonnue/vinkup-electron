import { env } from '../../config/env.js';

export const AUTH_COOKIE_NAME = 'auth_token';

const isProd = env.NODE_ENV === 'production';

// Used when setting the cookie (login)
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ('none' as const) : ('lax' as const),
  path: '/',
};

// Used when clearing the cookie (logout): same flags, no maxAge
export const AUTH_COOKIE_CLEAR_OPTIONS = { ...AUTH_COOKIE_OPTIONS };

export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // keep in sync with JWT_EXPIRES_IN
