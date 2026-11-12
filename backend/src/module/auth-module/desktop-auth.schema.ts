import { z } from 'zod';

const LOOPBACK_REDIRECT = /^http:\/\/127\.0\.0\.1:\d{1,5}\/[^\s]*$/;

/** RFC 7636: 43–128 characters from the base64url alphabet. */
const pkceValue = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/);

export const createDesktopTransactionSchema = z.object({
  redirectUri: z
    .string()
    .max(2000)
    .regex(LOOPBACK_REDIRECT, 'redirectUri must be a loopback HTTP URL on 127.0.0.1'),
  codeChallenge: pkceValue,
  codeChallengeMethod: z.literal('S256'),
});

export const exchangeDesktopCodeSchema = z.object({
  code: z.string().min(20).max(512),
  codeVerifier: pkceValue,
});

export const refreshDesktopSessionSchema = z.object({
  refreshToken: z.string().min(20).max(512),
});

export const logoutDesktopSessionSchema = z
  .object({
    refreshToken: z.string().min(20).max(512).optional(),
  })
  .default({});

export const desktopTransactionQuerySchema = z.object({
  transaction: z.string().uuid(),
});

export type CreateDesktopTransactionBody = z.infer<typeof createDesktopTransactionSchema>;
export type ExchangeDesktopCodeBody = z.infer<typeof exchangeDesktopCodeSchema>;
export type RefreshDesktopSessionBody = z.infer<typeof refreshDesktopSessionSchema>;
export type LogoutDesktopSessionBody = z.infer<typeof logoutDesktopSessionSchema>;
