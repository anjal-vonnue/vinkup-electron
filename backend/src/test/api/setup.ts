import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'dotenv';

// Runs before every API test file, before `app` or Prisma is imported.
// The API tests talk to a REAL database and wipe it, so they need their own one:
//   TEST_DATABASE_URL in backend/.env.test (or the shell), migrated with `prisma migrate deploy`.

const fromFile = existsSync('.env.test') ? parse(readFileSync('.env.test')) : {};
const testUrl = process.env.TEST_DATABASE_URL ?? fromFile.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Add it to backend/.env.test (see src/test/api/README.md).'
  );
}

// Never wipe the development database by mistake.
const devUrl = existsSync('.env') ? parse(readFileSync('.env')).DATABASE_URL : undefined;
if (devUrl && devUrl === testUrl) {
  throw new Error(
    'TEST_DATABASE_URL is the same as DATABASE_URL in .env. Use a separate database.'
  );
}

process.env.NODE_ENV = 'test';
process.env.PORT = '5000';
process.env.DATABASE_URL = testUrl;
process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_CALLBACK_URL = 'http://localhost:5000/api/auth/google/callback';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
process.env.JWT_EXPIRES_IN = '1h';
process.env.ALLOWED_EMAIL_DOMAIN = 'vonnue.com';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.CERTIFICATE_SIGNING_PRIVATE_KEY =
  process.env.CERTIFICATE_SIGNING_PRIVATE_KEY ??
  `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIAP/OGZR8LKufF+cT7XkL36MSrnWGc97jk2UARDFAKXa
-----END PRIVATE KEY-----`;
process.env.SLACK_ENABLED = 'false';
process.env.SLACK_BOT_TOKEN = '';
