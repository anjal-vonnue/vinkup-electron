import { isIgnoredPath } from './workspaceIgnore';

export type ValidateFileNameResult = { ok: true; path: string } | { ok: false; message: string };

function ancestorFolders(path: string): string[] {
  const parts = path.split('/').slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}

export function validateFileName(input: string, existingPaths: string[]): ValidateFileNameResult {
  let path = input.trim();
  if (path.startsWith('./')) path = path.slice(2);

  if (path.length === 0) {
    return { ok: false, message: 'Enter a file name.' };
  }

  if (path.length > 200) {
    return { ok: false, message: 'File path must be 200 characters or fewer.' };
  }

  if (!/^[A-Za-z0-9._/-]+$/.test(path)) {
    return { ok: false, message: 'Use only letters, numbers, dots, dashes, underscores and /.' };
  }

  const segments = path.split('/');
  const isMalformedPath =
    path.startsWith('/') ||
    path.endsWith('/') ||
    path.includes('//') ||
    segments.includes('..') ||
    segments.includes('.');
  if (isMalformedPath) {
    return { ok: false, message: "That path isn't valid." };
  }

  if (isIgnoredPath(path)) {
    return { ok: false, message: "Files in that folder aren't saved." };
  }

  // Windows silently drops trailing dots, so "notes." would end up as "notes" on disk.
  if (segments.some((segment) => segment.endsWith('.'))) {
    return { ok: false, message: 'Names cannot end with a dot.' };
  }

  const lowerPath = path.toLowerCase();
  const lowerExisting = existingPaths.map((existing) => existing.toLowerCase());
  const existingFolders = new Set(
    existingPaths.flatMap((existing) =>
      ancestorFolders(existing).map((folder) => folder.toLowerCase())
    )
  );

  const isDuplicateFile = lowerExisting.includes(lowerPath);
  const usesExistingFileAsFolder = lowerExisting.some((existing) =>
    lowerPath.startsWith(`${existing}/`)
  );
  const collidesWithExistingFolder = existingFolders.has(lowerPath);

  if (isDuplicateFile || usesExistingFileAsFolder || collidesWithExistingFolder) {
    return { ok: false, message: 'A file or folder with that name already exists.' };
  }

  return { ok: true, path };
}
