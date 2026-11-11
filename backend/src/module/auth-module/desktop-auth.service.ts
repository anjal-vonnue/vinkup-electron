import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { MeResponse } from '@itp/types';
import { AppError } from '../../errors/AppError';
import { signDesktopAccessToken, verifyDesktopAccessToken, type JwtPayload } from '../../utils/jwt';
import { AuthRepository } from './auth.repository';
import {
  DESKTOP_HANDOFF_TTL_MS,
  DESKTOP_LOOPBACK_HOST,
  DESKTOP_REFRESH_TOKEN_TTL_MS,
  DESKTOP_TRANSACTION_TTL_MS,
} from './desktop-auth.constants';
import { DesktopAuthRepository, type DesktopUserSnapshot } from './desktop-auth.repository';
import type {
  desktop_auth_transactionModel,
  desktop_sessionModel,
} from '../../generated/prisma/models';

export type CreateTransactionInput = {
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
};

export type DesktopSessionResult = {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: MeResponse;
};

const base64url = (buffer: Buffer): string => buffer.toString('base64url');
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

function isLoopbackRedirect(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return (
      parsed.protocol === 'http:' &&
      parsed.hostname === DESKTOP_LOOPBACK_HOST &&
      parsed.port !== '' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.search === '' &&
      parsed.hash === ''
    );
  } catch {
    return false;
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function toMeResponse(user: DesktopUserSnapshot): MeResponse {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

function toUserSnapshot(
  row: desktop_auth_transactionModel | desktop_sessionModel
): DesktopUserSnapshot {
  if (!row.user_id || !row.user_email || !row.user_name) {
    throw new AppError(401, 'DESKTOP_AUTH_FAILED', 'The sign-in did not complete.');
  }
  if (row.user_role !== 'trainee' && row.user_role !== 'admin') {
    throw new AppError(401, 'DESKTOP_AUTH_FAILED', 'The sign-in did not complete.');
  }
  return {
    id: row.user_id,
    email: row.user_email,
    name: row.user_name,
    role: row.user_role,
  };
}

function loopbackRedirect(uri: string, params: Record<string, string>): string {
  const url = new URL(uri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export class DesktopAuthService {
  constructor(
    private readonly repository = new DesktopAuthRepository(),
    private readonly authRepository = new AuthRepository(),
    private readonly clock: () => Date = () => new Date()
  ) {}

  async createTransaction(input: CreateTransactionInput): Promise<{
    transactionId: string;
    state: string;
    authorizationUrl: string;
    expiresAt: string;
  }> {
    if (!isLoopbackRedirect(input.redirectUri)) {
      throw new AppError(
        400,
        'DESKTOP_AUTH_INVALID_STATE',
        'The desktop callback must be a loopback HTTP address on 127.0.0.1.'
      );
    }

    const now = this.clock();
    const state = base64url(randomBytes(32));
    const expiresAt = new Date(now.getTime() + DESKTOP_TRANSACTION_TTL_MS);

    const transaction = await this.repository.createTransaction({
      state,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
      loopbackRedirectUri: input.redirectUri,
      expiresAt,
    });

    return {
      transactionId: transaction.id,
      state,
      authorizationUrl: `/api/auth/desktop/google?transaction=${transaction.id}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async findTransactionForStart(transactionId: string): Promise<desktop_auth_transactionModel> {
    const transaction = await this.repository.findPendingTransactionById(
      transactionId,
      this.clock()
    );
    if (!transaction) {
      throw new AppError(
        400,
        'DESKTOP_AUTH_INVALID_STATE',
        'This sign-in attempt is invalid or has expired.'
      );
    }
    return transaction;
  }

  /** Look up the transaction by the OAuth `state` without consuming it yet. */
  async findTransactionForCallback(state: string): Promise<desktop_auth_transactionModel> {
    const transaction = await this.repository.findTransactionByState(state);
    if (!transaction || transaction.status !== 'pending') {
      throw new AppError(400, 'DESKTOP_AUTH_INVALID_STATE', 'This sign-in attempt is invalid.');
    }
    if (transaction.expires_at <= this.clock()) {
      await this.repository.failTransaction(transaction.id, 'DESKTOP_AUTH_EXPIRED', this.clock());
      throw new AppError(400, 'DESKTOP_AUTH_EXPIRED', 'This sign-in attempt has expired.');
    }
    return transaction;
  }

  async claimTransaction(transactionId: string): Promise<boolean> {
    const result = await this.repository.claimTransaction(transactionId, this.clock());
    return result.count === 1;
  }

  async failTransactionAndRedirect(
    transaction: desktop_auth_transactionModel,
    errorCode: string
  ): Promise<string> {
    await this.repository.failTransaction(transaction.id, errorCode, this.clock());
    return loopbackRedirect(transaction.loopback_redirect_uri, {
      error: errorCode,
      state: transaction.state,
    });
  }

  /**
   * Called after Passport verified the Google profile. Creates a one-time
   * handoff code; the exchange endpoint will only release Vinkup session
   * credentials to the process that can prove the PKCE verifier.
   */
  async completeTransaction(
    transaction: desktop_auth_transactionModel,
    user: Express.User
  ): Promise<string> {
    const now = this.clock();
    const handoffCode = base64url(randomBytes(32));
    const result = await this.repository.completeTransaction(
      transaction.id,
      { id: user.id, email: user.email, name: user.name, role: user.role },
      sha256(handoffCode),
      new Date(now.getTime() + DESKTOP_HANDOFF_TTL_MS),
      now
    );

    if (result.count !== 1) {
      throw new AppError(409, 'DESKTOP_AUTH_CODE_USED', 'This sign-in attempt was already used.');
    }

    return loopbackRedirect(transaction.loopback_redirect_uri, {
      code: handoffCode,
      state: transaction.state,
    });
  }

  async exchange(code: string, codeVerifier: string): Promise<DesktopSessionResult> {
    const now = this.clock();
    const transaction = await this.repository.findTransactionByHandoffHash(sha256(code));

    if (!transaction) {
      throw new AppError(400, 'DESKTOP_AUTH_INVALID_CODE', 'This sign-in code is invalid.');
    }
    if (transaction.status === 'consumed' || transaction.handoff_consumed_at) {
      throw new AppError(409, 'DESKTOP_AUTH_CODE_USED', 'This sign-in code was already used.');
    }
    if (transaction.status !== 'authenticated') {
      throw new AppError(400, 'DESKTOP_AUTH_INVALID_CODE', 'This sign-in code is invalid.');
    }
    if (!transaction.handoff_expires_at || transaction.handoff_expires_at <= now) {
      throw new AppError(400, 'DESKTOP_AUTH_EXPIRED', 'This sign-in code has expired.');
    }

    const challenge = base64url(createHash('sha256').update(codeVerifier).digest());
    if (!constantTimeEqual(challenge, transaction.code_challenge)) {
      throw new AppError(400, 'DESKTOP_AUTH_INVALID_PKCE', 'The sign-in proof is invalid.');
    }

    const consumed = await this.repository.consumeHandoff(transaction.id, now);
    if (consumed.count !== 1) {
      throw new AppError(409, 'DESKTOP_AUTH_CODE_USED', 'This sign-in code was already used.');
    }

    const user = toUserSnapshot(transaction);
    return this.createSession(user, now);
  }

  async getSession(accessToken: string): Promise<{ user: MeResponse }> {
    const payload = this.verifyAccessToken(accessToken);
    const now = this.clock();
    const session = await this.repository.findSessionById(payload.sid);

    if (!session || session.revoked_at) {
      throw new AppError(401, 'DESKTOP_SESSION_REVOKED', 'This session was signed out.');
    }
    if (session.expires_at <= now) {
      throw new AppError(401, 'DESKTOP_SESSION_EXPIRED', 'This session has expired.');
    }

    await this.assertUserStillActive(payload);
    return { user: toMeResponse(payload) };
  }

  async refresh(refreshToken: string): Promise<DesktopSessionResult> {
    const now = this.clock();
    const session = await this.repository.findSessionByTokenHash(sha256(refreshToken));

    if (!session || session.revoked_at) {
      throw new AppError(401, 'DESKTOP_SESSION_REVOKED', 'This session was signed out.');
    }
    if (session.expires_at <= now) {
      await this.repository.revokeSessionByTokenHash(sha256(refreshToken), now);
      throw new AppError(401, 'DESKTOP_SESSION_EXPIRED', 'This session has expired.');
    }

    const user = toUserSnapshot(session);
    await this.assertUserStillActive(user);

    const newRefreshToken = base64url(randomBytes(48));
    const expiresAt = new Date(now.getTime() + DESKTOP_REFRESH_TOKEN_TTL_MS);
    const rotated = await this.repository.rotateSessionToken(
      session.id,
      sha256(refreshToken),
      sha256(newRefreshToken),
      expiresAt,
      now
    );

    if (rotated.count !== 1) {
      throw new AppError(401, 'DESKTOP_SESSION_REVOKED', 'This session was signed out.');
    }

    return this.buildSessionResult(user, session.id, newRefreshToken, expiresAt, now);
  }

  async logout(options: { accessToken?: string; refreshToken?: string }): Promise<void> {
    const now = this.clock();

    if (options.accessToken) {
      try {
        const payload = verifyDesktopAccessToken(options.accessToken);
        await this.repository.revokeSessionById(payload.sid, now);
      } catch {
        // An expired access token must not prevent the refresh token from being revoked.
      }
    }

    if (options.refreshToken) {
      await this.repository.revokeSessionByTokenHash(sha256(options.refreshToken), now);
    }
  }

  private async createSession(user: DesktopUserSnapshot, now: Date): Promise<DesktopSessionResult> {
    const sessionId = randomUUID();
    const refreshToken = base64url(randomBytes(48));
    const expiresAt = new Date(now.getTime() + DESKTOP_REFRESH_TOKEN_TTL_MS);

    await this.repository.createSession({
      id: sessionId,
      user,
      refreshTokenHash: sha256(refreshToken),
      expiresAt,
      now,
    });

    return this.buildSessionResult(user, sessionId, refreshToken, expiresAt, now);
  }

  private buildSessionResult(
    user: DesktopUserSnapshot,
    sessionId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
    now: Date
  ): DesktopSessionResult {
    const accessToken = signDesktopAccessToken(user, sessionId);
    const decoded = jwt.decode(accessToken) as { exp?: number };
    const accessTokenExpiresAt = decoded.exp
      ? new Date(decoded.exp * 1000)
      : new Date(now.getTime() + DESKTOP_TRANSACTION_TTL_MS);

    return {
      accessToken,
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      refreshToken,
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
      user: toMeResponse(user),
    };
  }

  private verifyAccessToken(accessToken: string): JwtPayload & { sid: string } {
    try {
      return verifyDesktopAccessToken(accessToken);
    } catch {
      throw new AppError(401, 'DESKTOP_SESSION_EXPIRED', 'Your session has expired.');
    }
  }

  private async assertUserStillActive(user: DesktopUserSnapshot): Promise<void> {
    if (user.role === 'admin') {
      const admin = await this.authRepository.findActiveAdminById(user.id);
      if (!admin) {
        throw new AppError(401, 'DESKTOP_SESSION_REVOKED', 'This account is no longer active.');
      }
      return;
    }

    const trainee = await this.authRepository.findById(user.id);
    if (!trainee) {
      throw new AppError(401, 'DESKTOP_SESSION_REVOKED', 'This account is no longer active.');
    }
  }
}

export const desktopAuthService = new DesktopAuthService();
