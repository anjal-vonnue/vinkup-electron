import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The small part of Electron's `safeStorage` this module needs. Injecting it
 * keeps the storage rules testable without launching Electron.
 */
export interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
  getSelectedStorageBackend?(): string;
}

export interface DesktopCredentialStorage {
  /**
   * True when credentials written now would be encrypted by the OS. On Linux
   * with only `basic_text` available we report false and keep the session in
   * memory instead of writing a recoverable token.
   */
  isPersistent(): boolean;
  load(): Promise<string | null>;
  /** Returns whether the refresh token was written to disk. */
  save(refreshToken: string): Promise<boolean>;
  clear(): Promise<void>;
}

type StoredCredential = {
  version: 1;
  refreshToken: string;
};

export class SecureDesktopCredentialStorage implements DesktopCredentialStorage {
  constructor(
    private readonly filePath: string,
    private readonly safeStorage: SafeStorageLike,
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly logger: Pick<Console, 'warn'> = console
  ) {}

  isPersistent(): boolean {
    if (!this.safeStorage.isEncryptionAvailable()) return false;

    // Chromium's "basic_text" backend stores the key in plain sight and is not
    // encryption. Treat it as unavailable rather than persisting credentials.
    if (
      this.platform === 'linux' &&
      this.safeStorage.getSelectedStorageBackend?.() === 'basic_text'
    ) {
      return false;
    }

    return true;
  }

  async load(): Promise<string | null> {
    if (!this.isPersistent()) return null;

    let contents: string;
    try {
      contents = await readFile(this.filePath, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') this.logger.warn('[auth] Could not read the stored session', error);
      return null;
    }

    try {
      const stored = JSON.parse(contents) as Partial<StoredCredential>;
      if (stored.version !== 1 || typeof stored.refreshToken !== 'string') return null;
      const decrypted = this.safeStorage.decryptString(Buffer.from(stored.refreshToken, 'base64'));
      return decrypted.length > 0 ? decrypted : null;
    } catch (error) {
      this.logger.warn('[auth] Could not decrypt the stored session', error);
      return null;
    }
  }

  async save(refreshToken: string): Promise<boolean> {
    if (!this.isPersistent()) return false;

    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    const stored: StoredCredential = {
      version: 1,
      refreshToken: this.safeStorage.encryptString(refreshToken).toString('base64'),
    };

    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(temporaryPath, JSON.stringify(stored), { mode: 0o600 });
      await rename(temporaryPath, this.filePath);
      return true;
    } catch (error) {
      this.logger.warn('[auth] Could not save the session', error);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      return false;
    }
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true }).catch(() => undefined);
  }
}
