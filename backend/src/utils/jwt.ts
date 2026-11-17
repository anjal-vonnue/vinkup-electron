import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export type UserRole = 'trainee' | 'mentor' | 'manager';

export interface JwtPayload {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

function normalizeRole(role: unknown): UserRole {
  if (role === 'admin' || role === 'mentor') return 'mentor';
  if (role === 'manager') return 'manager';
  return 'trainee';
}

export function signJwt(payload: JwtPayload) {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyJwt(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as Omit<JwtPayload, 'role'> & {
    role?: unknown;
  };
  return {
    id: decoded.id,
    email: decoded.email,
    name: decoded.name,
    role: normalizeRole(decoded.role),
  };
}

export interface DesktopAccessTokenPayload extends JwtPayload {
  /** Id of the revocable desktop_session row. */
  sid: string;
  /** Distinguishes desktop bearer tokens from web cookie tokens. */
  typ: 'desktop';
}

export function signDesktopAccessToken(payload: JwtPayload, sessionId: string): string {
  const options: SignOptions = {
    expiresIn: env.DESKTOP_ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
  };
  return jwt.sign({ ...payload, sid: sessionId, typ: 'desktop' }, env.JWT_SECRET, options);
}

export function verifyDesktopAccessToken(token: string): DesktopAccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as Partial<DesktopAccessTokenPayload> & {
    role?: unknown;
  };
  if (
    decoded.typ !== 'desktop' ||
    typeof decoded.sid !== 'string' ||
    typeof decoded.id !== 'string' ||
    typeof decoded.email !== 'string' ||
    typeof decoded.name !== 'string'
  ) {
    throw new Error('Not a desktop access token');
  }
  const role = normalizeRole(decoded.role);
  if (role !== 'trainee' && role !== 'mentor' && role !== 'manager') {
    throw new Error('Not a desktop access token');
  }
  return {
    id: decoded.id,
    email: decoded.email,
    name: decoded.name,
    role,
    sid: decoded.sid,
    typ: 'desktop',
  };
}
