import { access, mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

export type CertificateDirectory = {
  path: string;
  label: string;
  create: boolean;
};

export type SavedCertificatePdf = {
  fileName: string;
  location: string;
};

const MAX_FILE_NAME_ATTEMPTS = 1000;

export async function saveCertificatePdf(
  pdf: Buffer,
  baseFileName: string,
  directories: CertificateDirectory[]
): Promise<SavedCertificatePdf> {
  const failures: string[] = [];

  for (const directory of directories) {
    try {
      if (directory.create) await mkdir(directory.path, { recursive: true });
      const directoryInfo = await stat(directory.path);
      if (!directoryInfo.isDirectory()) throw new Error('The destination is not a directory.');
      await access(directory.path, constants.W_OK);

      for (let index = 0; index < MAX_FILE_NAME_ATTEMPTS; index += 1) {
        const fileName = `${baseFileName}${index === 0 ? '' : ` (${index})`}.pdf`;
        const filePath = path.join(directory.path, fileName);
        try {
          await writeFile(filePath, pdf, { flag: 'wx' });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
          try {
            await unlink(filePath);
          } catch (cleanupError) {
            if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw new Error(
                `Failed to remove an incomplete certificate PDF: ${String(cleanupError)}`,
                { cause: error }
              );
            }
          }
          throw error;
        }
        return { fileName, location: directory.label };
      }

      throw new Error(`Could not find an unused certificate file name in ${directory.path}.`);
    } catch (error) {
      failures.push(
        `${directory.label}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  throw new Error(`Unable to save the certificate PDF. ${failures.join('; ')}`);
}
