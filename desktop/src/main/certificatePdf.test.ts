import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { saveCertificatePdf, type CertificateDirectory } from './certificatePdf.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  );
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vinkup-certificate-pdf-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('saveCertificatePdf', () => {
  it('saves in the first available folder and adds a suffix rather than overwriting', async () => {
    const downloads = await createTemporaryDirectory();
    await writeFile(path.join(downloads, 'certificate.pdf'), 'existing PDF');

    const saved = await saveCertificatePdf(Buffer.from('new PDF'), 'certificate', [
      { path: downloads, label: 'Downloads', create: false },
    ]);

    expect(saved).toEqual({ fileName: 'certificate (1).pdf', location: 'Downloads' });
    expect(await readFile(path.join(downloads, 'certificate.pdf'), 'utf8')).toBe('existing PDF');
    expect(await readFile(path.join(downloads, saved.fileName), 'utf8')).toBe('new PDF');
  });

  it('falls back to the next folder when Downloads is unavailable', async () => {
    const root = await createTemporaryDirectory();
    const downloads = path.join(root, 'missing-downloads');
    const documents = path.join(root, 'Documents', 'VinkUp Certificates');
    const directories: CertificateDirectory[] = [
      { path: downloads, label: 'Downloads', create: false },
      { path: documents, label: 'Documents/VinkUp Certificates', create: true },
    ];

    const saved = await saveCertificatePdf(Buffer.from('PDF data'), 'certificate', directories);

    expect(saved.location).toBe('Documents/VinkUp Certificates');
    expect(await readFile(path.join(documents, saved.fileName), 'utf8')).toBe('PDF data');
    await expect(readFile(downloads, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('reports an error when no destination is writable', async () => {
    const root = await createTemporaryDirectory();
    const missing = path.join(root, 'missing');

    await expect(
      saveCertificatePdf(Buffer.from('PDF data'), 'certificate', [
        { path: missing, label: 'Downloads', create: false },
      ])
    ).rejects.toThrow('Unable to save the certificate PDF. Downloads:');
  });
});
