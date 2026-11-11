/** How long the Electron app has to finish the browser leg of a login. */
export const DESKTOP_TRANSACTION_TTL_MS = 5 * 60 * 1000;

/** How long the loopback listener has to redeem the one-time handoff code. */
export const DESKTOP_HANDOFF_TTL_MS = 60 * 1000;

/** Sliding lifetime of a refresh session. */
export const DESKTOP_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The desktop flow only accepts a loopback IPv4 redirect. */
export const DESKTOP_LOOPBACK_HOST = '127.0.0.1';
