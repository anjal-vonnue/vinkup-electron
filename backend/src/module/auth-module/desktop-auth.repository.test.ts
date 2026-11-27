import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  desktop_auth_transaction: {
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  desktop_session: {
    create: vi.fn(),
  },
}));

vi.mock('../../lib/prisma', () => ({ prisma }));

import { DesktopAuthRepository, type DesktopUserSnapshot } from './desktop-auth.repository';

const now = new Date('2026-01-01T12:00:00.000Z');
const user: DesktopUserSnapshot = {
  id: '3f2c9c0e-5b1d-4c53-9a7e-0d6f2f1a9b11',
  email: 'trainee@vonnue.com',
  name: 'Test Trainee',
  role: 'trainee',
};

beforeEach(() => {
  prisma.$transaction.mockReset();
  prisma.desktop_auth_transaction.updateMany.mockReset();
  prisma.desktop_auth_transaction.deleteMany.mockReset();
  prisma.desktop_session.create.mockReset();
});

describe('DesktopAuthRepository client injection', () => {
  it('consumes a handoff with the shared client by default', async () => {
    prisma.desktop_auth_transaction.updateMany.mockResolvedValue({ count: 1 });

    await expect(new DesktopAuthRepository().consumeHandoff('transaction-1', now)).resolves.toEqual(
      { count: 1 }
    );
    expect(prisma.desktop_auth_transaction.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'transaction-1',
        status: 'authenticated',
        handoff_consumed_at: null,
        handoff_expires_at: { gt: now },
      },
      data: { status: 'consumed', handoff_consumed_at: now, consumed_at: now },
    });
  });

  it('can run the exchange writes through a supplied transaction client', async () => {
    const client = {
      desktop_auth_transaction: { updateMany: vi.fn(), deleteMany: vi.fn() },
      desktop_session: { create: vi.fn() },
    };
    client.desktop_auth_transaction.updateMany.mockResolvedValue({ count: 1 });
    client.desktop_auth_transaction.deleteMany.mockResolvedValue({ count: 1 });
    client.desktop_session.create.mockResolvedValue({ id: 'session-1' });
    const repository = new DesktopAuthRepository();

    await repository.consumeHandoff('transaction-1', now, client as never);
    await repository.createSession(
      {
        id: 'session-1',
        user,
        refreshTokenHash: 'hash',
        expiresAt: now,
        now,
      },
      client as never
    );
    await repository.deleteTransaction('transaction-1', client as never);

    expect(client.desktop_auth_transaction.updateMany).toHaveBeenCalledTimes(1);
    expect(client.desktop_session.create).toHaveBeenCalledTimes(1);
    expect(client.desktop_auth_transaction.deleteMany).toHaveBeenCalledWith({
      where: { id: 'transaction-1' },
    });
    expect(prisma.desktop_auth_transaction.updateMany).not.toHaveBeenCalled();
    expect(prisma.desktop_session.create).not.toHaveBeenCalled();
  });
});

describe('DesktopAuthRepository atomic exchange', () => {
  const exchangeData = {
    transactionId: 'transaction-1',
    sessionId: 'session-1',
    user,
    refreshTokenHash: 'hash',
    expiresAt: now,
    now,
  };

  function mockTransaction(client: {
    desktop_auth_transaction: {
      updateMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
    desktop_session: { create: ReturnType<typeof vi.fn> };
  }) {
    prisma.$transaction.mockImplementation((callback: (tx: typeof client) => unknown) =>
      callback(client)
    );
  }

  it('consumes the handoff, creates the session and deletes the transaction atomically', async () => {
    const client = {
      desktop_auth_transaction: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      desktop_session: { create: vi.fn().mockResolvedValue({ id: 'session-1' }) },
    };
    mockTransaction(client);

    await expect(
      new DesktopAuthRepository().exchangeHandoffAndCreateSession(exchangeData)
    ).resolves.toEqual({ id: 'session-1' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(client.desktop_auth_transaction.updateMany).toHaveBeenCalledTimes(1);
    expect(client.desktop_auth_transaction.deleteMany).toHaveBeenCalledWith({
      where: { id: 'transaction-1' },
    });
    expect(client.desktop_session.create).toHaveBeenCalledWith({
      data: {
        id: 'session-1',
        user_id: user.id,
        user_email: user.email,
        user_name: user.name,
        user_role: user.role,
        refresh_token_hash: 'hash',
        expires_at: now,
        last_used_at: now,
      },
    });
  });

  it('does not write anything when the handoff was already consumed', async () => {
    const client = {
      desktop_auth_transaction: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        deleteMany: vi.fn(),
      },
      desktop_session: { create: vi.fn() },
    };
    mockTransaction(client);

    await expect(
      new DesktopAuthRepository().exchangeHandoffAndCreateSession(exchangeData)
    ).resolves.toBeNull();
    expect(client.desktop_session.create).not.toHaveBeenCalled();
    expect(client.desktop_auth_transaction.deleteMany).not.toHaveBeenCalled();
  });

  it('propagates a session creation failure so the transaction rolls back', async () => {
    const client = {
      desktop_auth_transaction: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn(),
      },
      desktop_session: { create: vi.fn().mockRejectedValue(new Error('insert failed')) },
    };
    mockTransaction(client);

    await expect(
      new DesktopAuthRepository().exchangeHandoffAndCreateSession(exchangeData)
    ).rejects.toThrow('insert failed');
    expect(client.desktop_auth_transaction.deleteMany).not.toHaveBeenCalled();
  });

  it('propagates a deletion failure so the session and handoff consumption roll back', async () => {
    const client = {
      desktop_auth_transaction: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        deleteMany: vi.fn().mockRejectedValue(new Error('delete failed')),
      },
      desktop_session: { create: vi.fn().mockResolvedValue({ id: 'session-1' }) },
    };
    mockTransaction(client);

    await expect(
      new DesktopAuthRepository().exchangeHandoffAndCreateSession(exchangeData)
    ).rejects.toThrow('delete failed');
    expect(client.desktop_auth_transaction.updateMany).toHaveBeenCalledTimes(1);
    expect(client.desktop_session.create).toHaveBeenCalledTimes(1);
  });
});
