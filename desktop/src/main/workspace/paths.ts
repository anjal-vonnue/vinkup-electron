import path from 'node:path';

/**
 * Workspace path rules. These mirror `frontend/src/lib/workspaceIgnore.ts` and
 * `frontend/src/lib/fileTypes.ts`: the renderer decides what to show and save,
 * but main must enforce the same limits because every value crosses IPC.
 */
export const TASK_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** `html-day-01-t-1` -> `html`; ids without a day segment use the whole id. */
export function courseFromTaskId(taskId: string): string {
  return taskId.split('-day-')[0] || taskId;
}

export const IGNORED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.vite',
  '.cache',
  '.git',
  'generated',
  '.vinkup',
  '.not-committed',
];
export const IGNORED_FILES = ['package-lock.json', '.DS_Store'];
export const MAX_FILE_CHARS = 200_000;
export const MAX_FILES = 200;
export const MAX_PATH_CHARS = 200;

export type SkippedFileReason = 'ignored' | 'too-large' | 'binary' | 'invalid-path';

/** NUL bytes or U+FFFD (invalid UTF-8 read as text) mean this isn't a text file. */
export function looksBinary(text: string): boolean {
  return text.includes('\u0000') || text.includes('\ufffd');
}

/** true for anything inside an ignored folder, an ignored file name, or a *.log file */
export function isIgnoredPath(relativePath: string): boolean {
  const segments = relativePath.split('/');
  const lastSegment = segments[segments.length - 1] ?? '';

  return (
    segments.some((segment) => IGNORED_DIRS.includes(segment)) ||
    IGNORED_FILES.includes(lastSegment) ||
    lastSegment.endsWith('.log')
  );
}

/** Rejects absolute paths, NUL bytes, parent traversal and overlong paths. */
export function isSafeRelativePath(relativePath: string): boolean {
  if (relativePath.length === 0 || relativePath.length > MAX_PATH_CHARS) return false;
  if (relativePath.includes('\0')) return false;
  if (relativePath.includes('\\')) return false;
  if (path.posix.isAbsolute(relativePath)) return false;

  const normalized = path.posix.normalize(relativePath);
  if (normalized === '.' || normalized === '..') return false;
  if (normalized.startsWith('../')) return false;
  if (normalized.includes('/../')) return false;

  return normalized === relativePath;
}

/**
 * Resolves a renderer-supplied relative path inside a workspace root.
 * A target outside the root throws; callers must not fall back to the raw path.
 */
export function resolveInsideRoot(root: string, relativePath: string): string {
  if (!isSafeRelativePath(relativePath)) {
    throw new Error(`Invalid workspace path: ${relativePath}`);
  }

  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Workspace path escapes the workspace root: ${relativePath}`);
  }
  return target;
}

/** true when a renderer file should be written to disk. */
export function shouldWriteFile(
  relativePath: string,
  content: unknown
): { ok: true } | { ok: false; reason: SkippedFileReason } {
  if (!isSafeRelativePath(relativePath)) return { ok: false, reason: 'invalid-path' };
  if (isIgnoredPath(relativePath)) return { ok: false, reason: 'ignored' };
  if (typeof content !== 'string') return { ok: false, reason: 'binary' };
  if (content.length > MAX_FILE_CHARS) return { ok: false, reason: 'too-large' };
  if (looksBinary(content)) return { ok: false, reason: 'binary' };
  return { ok: true };
}

export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.jsx': 'text/javascript; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
  '.tsx': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

export function mimeTypeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Text files the Node runtime can hand back to the editor. */
export function isTextExtension(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '' || extension === '.env') return true;
  return [
    '.html',
    '.htm',
    '.css',
    '.js',
    '.mjs',
    '.cjs',
    '.jsx',
    '.ts',
    '.tsx',
    '.json',
    '.sql',
    '.md',
    '.svg',
    '.txt',
    '.yml',
    '.yaml',
    '.prisma',
    '.xml',
    '.toml',
    '.ini',
  ].includes(extension);
}
