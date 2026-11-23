import { isIgnoredPath, MAX_PATH_CHARS } from './workspaceIgnore';
import { validateFileName } from './validateFileName';

const MAX_PATH_LENGTH = MAX_PATH_CHARS;

export type RelocationPlan =
  | { ok: true; kind: 'file' | 'folder'; from: string; to: string; unchanged: boolean }
  | { ok: false; message: string };

/** True when `path` is `folder` itself or lives inside it. */
const isInside = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`);

/** Where `path` ends up when `from` (a file or a whole folder) is renamed or moved to `to`. */
export function rewritePath(path: string, from: string, to: string): string {
  return isInside(path, from) ? to + path.slice(from.length) : path;
}

/** Folder names follow the file rules minus the extension check. Returns an error message or null. */
export function folderPathError(path: string, others: string[]): string | null {
  if (path.length === 0) return 'Enter a folder name.';
  if (path.length > MAX_PATH_LENGTH) {
    return `Folder path must be ${MAX_PATH_LENGTH} characters or fewer.`;
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(path)) {
    return 'Use only letters, numbers, dots, dashes, underscores and /.';
  }
  const segments = path.split('/');
  if (
    path.startsWith('/') ||
    path.endsWith('/') ||
    path.includes('//') ||
    segments.includes('..')
  ) {
    return "That path isn't valid.";
  }
  if (segments.some((segment) => segment.startsWith('.'))) return 'Hidden folders aren’t allowed.';
  if (isIgnoredPath(path)) return "Files in that folder aren't saved.";

  const lower = path.toLowerCase();
  const clashes = others.some((other) => {
    const otherLower = other.toLowerCase();
    return (
      otherLower === lower ||
      otherLower.startsWith(`${lower}/`) || // would merge into an existing folder
      lower.startsWith(`${otherLower}/`) // would sit inside an existing file
    );
  });
  return clashes ? 'A file or folder with that name already exists.' : null;
}

/**
 * Checks a rename or move of `from` to `to` against the current file paths.
 * Rename and move are the same operation: `from` becomes `to`, and everything inside a folder follows.
 */
export function planRelocation(
  existingPaths: string[],
  from: string,
  rawTo: string
): RelocationPlan {
  let to = rawTo.trim();
  if (to.startsWith('./')) to = to.slice(2);

  const isFile = existingPaths.includes(from);
  const members = isFile ? [from] : existingPaths.filter((path) => isInside(path, from));
  if (members.length === 0) return { ok: false, message: 'That file or folder no longer exists.' };
  const kind = isFile ? 'file' : 'folder';

  if (to === from) return { ok: true, kind, from, to, unchanged: true };
  if (kind === 'folder' && isInside(to, from)) {
    return { ok: false, message: "A folder can't be moved into itself." };
  }

  // Everything that is not being moved: the paths the new name must not collide with.
  const others = existingPaths.filter((path) => !isInside(path, from));

  if (kind === 'file') {
    const result = validateFileName(to, others);
    return result.ok
      ? { ok: true, kind, from, to: result.path, unchanged: false }
      : { ok: false, message: result.message };
  }

  const error = folderPathError(to, others);
  if (error) return { ok: false, message: error };

  const moved = members.map((path) => rewritePath(path, from, to));
  if (moved.some((path) => path.length > MAX_PATH_LENGTH)) {
    return { ok: false, message: `A path inside would exceed ${MAX_PATH_LENGTH} characters.` };
  }
  if (moved.some((path) => isIgnoredPath(path))) {
    return { ok: false, message: "Files in that folder aren't saved." };
  }
  return { ok: true, kind, from, to, unchanged: false };
}
