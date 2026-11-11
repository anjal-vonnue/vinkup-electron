import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SecureDesktopCredentialStorage, type SafeStorageLike } from './storage';

function fakeSafeStorage(options: { available?: boolean; backend?: string } = {}): SafeStorageLike {
  const available = options.available ?? true;
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (value) => {
      const decoded = value.toString('utf8');
      if (!decoded.startsWith('encrypted:')) throw new Error('not encrypted');
      return decoded.slice('encrypted:'.length);
    },
    getSelectedStorageBackend: () => options.backend ?? 'gnome_libsecret',
  };
}

describe('SecureDesktopCredentialStorage', () => {
  let directory: string;
  let filePath: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'vinkup-auth-'));
    filePath = path.join(directory, 'auth', 'session.json');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('saves an encrypted token, loads it and clears it', async () => {
    const storage = new SecureDesktopCredentialStorage(filePath, fakeSafeStorage(), 'linux', {
      warn: () => undefined,
    });

    expect(storage.isPersistent()).toBe(true);
    await expect(storage.save('refresh-123')).resolves.toBe(true);
    await expect(storage.load()).resolves.toBe('refresh-123');

    const raw = await readFile(filePath, 'utf8');
    expect(raw).not.toContain('refresh-123');
    expect(JSON.parse(raw)).toMatchObject({ version: 1 });

    if (process.platform !== 'win32') {
      const mode = (await stat(filePath)).mode & 0o777;
      expect(mode).toBe(0o600);
    }

    await storage.clear();
    await expect(storage.load()).resolves.toBeNull();
  });

  it('does not write a token when the OS has no secure storage', async () => {
    const storage = new SecureDesktopCredentialStorage(
      filePath,
      fakeSafeStorage({ available: false }),
      'linux',
      { warn: () => undefined }
    );

    expect(storage.isPersistent()).toBe(false);
    await expect(storage.save('refresh-123')).resolves.toBe(false);
    await expect(stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(storage.load()).resolves.toBeNull();
  });

  it('treats Chromium basic_text on Linux as unavailable', async () => {
    const storage = new SecureDesktopCredentialStorage(
      filePath,
      fakeSafeStorage({ backend: 'basic_text' }),
      'linux',
      { warn: () => undefined }
    );

    expect(storage.isPersistent()).toBe(false);
    await expect(storage.save('refresh-123')).resolves.toBe(false);
  });

  it('allows basic_text on other platforms', () => {
    const storage = new SecureDesktopCredentialStorage(
      filePath,
      fakeSafeStorage({ backend: 'basic_text' }),
      'darwin',
      { warn: () => undefined }
    );

    expect(storage.isPersistent()).toBe(true);
  });

  it('returns null for a corrupt store instead of throwing', async () => {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, '{"version":1,"refreshToken":"not-base64"}', 'utf8');

    const storage = new SecureDesktopCredentialStorage(filePath, fakeSafeStorage(), 'linux', {
      warn: () => undefined,
    });

    await expect(storage.load()).resolves.toBeNull();
  });

  it('returns null when a stored token can no longer be decrypted', async () => {
    const storage = new SecureDesktopCredentialStorage(filePath, fakeSafeStorage(), 'linux', {
      warn: () => undefined,
    });
    await storage.save('refresh-123');

    const changedKey = new SecureDesktopCredentialStorage(
      filePath,
      {
        ...fakeSafeStorage(),
        decryptString: () => {
          throw new Error('key changed');
        },
      },
      'linux',
      { warn: () => undefined }
    );

    await expect(changedKey.load()).resolves.toBeNull();
  });
});
