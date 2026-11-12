import { prisma } from '../../lib/prisma';

export type DesktopUserSnapshot = {
  id: string;
  email: string;
  name: string;
  role: 'trainee' | 'admin';
};

export class DesktopAuthRepository {
  createTransaction = (data: {
    state: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    loopbackRedirectUri: string;
    expiresAt: Date;
  }) =>
    prisma.desktop_auth_transaction.create({
      data: {
        state: data.state,
        code_challenge: data.codeChallenge,
        code_challenge_method: data.codeChallengeMethod,
        loopback_redirect_uri: data.loopbackRedirectUri,
        expires_at: data.expiresAt,
      },
    });

  findPendingTransactionById = (id: string, now: Date) =>
    prisma.desktop_auth_transaction.findFirst({
      where: { id, status: 'pending', expires_at: { gt: now } },
    });

  findTransactionByState = (state: string) =>
    prisma.desktop_auth_transaction.findUnique({ where: { state } });

  claimTransaction = (id: string, now: Date) =>
    prisma.desktop_auth_transaction.updateMany({
      where: { id, status: 'pending', expires_at: { gt: now } },
      data: { status: 'processing' },
    });

  completeTransaction = (
    id: string,
    user: DesktopUserSnapshot,
    handoffCodeHash: string,
    handoffExpiresAt: Date,
    now: Date
  ) =>
    prisma.desktop_auth_transaction.updateMany({
      where: { id, status: 'processing' },
      data: {
        status: 'authenticated',
        user_id: user.id,
        user_email: user.email,
        user_name: user.name,
        user_role: user.role,
        handoff_code_hash: handoffCodeHash,
        handoff_expires_at: handoffExpiresAt,
        consumed_at: now,
      },
    });

  failTransaction = (id: string, errorCode: string, now: Date) =>
    prisma.desktop_auth_transaction.updateMany({
      where: { id, status: { in: ['pending', 'processing'] } },
      data: { status: 'failed', error_code: errorCode, consumed_at: now },
    });

  findTransactionByHandoffHash = (handoffCodeHash: string) =>
    prisma.desktop_auth_transaction.findUnique({
      where: { handoff_code_hash: handoffCodeHash },
    });

  consumeHandoff = (id: string, now: Date) =>
    prisma.desktop_auth_transaction.updateMany({
      where: {
        id,
        status: 'authenticated',
        handoff_consumed_at: null,
        handoff_expires_at: { gt: now },
      },
      data: { status: 'consumed', handoff_consumed_at: now, consumed_at: now },
    });

  createSession = (data: {
    id: string;
    user: DesktopUserSnapshot;
    refreshTokenHash: string;
    expiresAt: Date;
    now: Date;
  }) =>
    prisma.desktop_session.create({
      data: {
        id: data.id,
        user_id: data.user.id,
        user_email: data.user.email,
        user_name: data.user.name,
        user_role: data.user.role,
        refresh_token_hash: data.refreshTokenHash,
        expires_at: data.expiresAt,
        last_used_at: data.now,
      },
    });

  findSessionByTokenHash = (refreshTokenHash: string) =>
    prisma.desktop_session.findUnique({ where: { refresh_token_hash: refreshTokenHash } });

  findSessionById = (id: string) => prisma.desktop_session.findUnique({ where: { id } });

  rotateSessionToken = (
    id: string,
    oldRefreshTokenHash: string,
    newRefreshTokenHash: string,
    expiresAt: Date,
    now: Date
  ) =>
    prisma.desktop_session.updateMany({
      where: {
        id,
        refresh_token_hash: oldRefreshTokenHash,
        revoked_at: null,
        expires_at: { gt: now },
      },
      data: {
        refresh_token_hash: newRefreshTokenHash,
        expires_at: expiresAt,
        last_used_at: now,
      },
    });

  revokeSessionByTokenHash = (refreshTokenHash: string, now: Date) =>
    prisma.desktop_session.updateMany({
      where: { refresh_token_hash: refreshTokenHash, revoked_at: null },
      data: { revoked_at: now },
    });

  revokeSessionById = (id: string, now: Date) =>
    prisma.desktop_session.updateMany({
      where: { id, revoked_at: null },
      data: { revoked_at: now },
    });
}
