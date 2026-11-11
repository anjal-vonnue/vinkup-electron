import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000), // the frontend's Vite proxy sends /api here
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().min(1),
  /**
   * Google redirect URI for the Electron flow. It is a second redirect URI on
   * the same Web OAuth client; no desktop client or client secret ships with
   * the app. Defaults to the web callback with `/desktop/` inserted.
   */
  GOOGLE_DESKTOP_CALLBACK_URL: z.preprocess(
    // `.env` values are strings; treat an empty line as "not set" so leaving the
    // optional variable blank still derives the URL from GOOGLE_CALLBACK_URL.
    (value) => (value === '' ? undefined : value),
    z.string().url().optional()
  ),
  /** Lifetime of a desktop access JWT. Refresh tokens are long-lived and revocable. */
  DESKTOP_ACCESS_TOKEN_TTL: z.string().default('15m'),
  ALLOWED_EMAIL_DOMAIN: z.string().min(1),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('1h'),
  NODE_ENV: z.string().min(1).default('development'),
});

// Crashes on startup with a clear message if a variable is missing
export const env = envSchema.parse(process.env);

/**
 * The Electron flow uses its own callback path so the existing web callback
 * keeps working. Register this URL on the same Google Web client.
 */
export const googleDesktopCallbackUrl =
  env.GOOGLE_DESKTOP_CALLBACK_URL ?? deriveDesktopCallbackUrl(env.GOOGLE_CALLBACK_URL);

function deriveDesktopCallbackUrl(webCallbackUrl: string): string {
  const url = new URL(webCallbackUrl);
  url.pathname = '/api/auth/desktop/callback';
  url.search = '';
  url.hash = '';
  return url.toString();
}
