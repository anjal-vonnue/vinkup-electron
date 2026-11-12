import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export type UserRole = 'trainee' | 'admin';

export interface JwtPayload {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export function signJwt(payload: JwtPayload) {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyJwt(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as Omit<JwtPayload, 'role'> & {
    role?: UserRole;
  };
  return {
    id: decoded.id,
    email: decoded.email,
    name: decoded.name,
    role: decoded.role ?? 'trainee',
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
  const decoded = jwt.verify(token, env.JWT_SECRET) as Partial<DesktopAccessTokenPayload>;
  if (
    decoded.typ !== 'desktop' ||
    typeof decoded.sid !== 'string' ||
    typeof decoded.id !== 'string' ||
    typeof decoded.email !== 'string' ||
    typeof decoded.name !== 'string' ||
    (decoded.role !== 'trainee' && decoded.role !== 'admin')
  ) {
    throw new Error('Not a desktop access token');
  }
  return {
    id: decoded.id,
    email: decoded.email,
    name: decoded.name,
    role: decoded.role,
    sid: decoded.sid,
    typ: 'desktop',
  };
}
