import { watch, type FSWatcher } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  isIgnoredPath,
  isSafeRelativePath,
  isTextExtension,
  looksBinary,
  MAX_FILE_CHARS,
  resolveInsideRoot,
  shouldWriteFile,
} from './paths';

export type WorkspaceWriteState = Map<string, string>;

export type ExternalFileChange = {
  path: string;
  /** null when the file no longer exists. */
  content: string | null;
};

const WATCH_DELAY_MS = 200;

function tempPathFor(target: string): string {
  const directory = path.dirname(target);
  const name = path.basename(target);
  return path.join(directory, `.${name}.${process.pid}.${Date.now()}.tmp`);
}

async function writeFileAtomic(target: string, content: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = tempPathFor(target);
  try {
    await writeFile(temporary, content, 'utf8');
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Empties the folder, so a reopened task never inherits stale files. Paths in
 * `preserve` (the Prisma database) survive the reset; everything else is removed.
 * A database left behind by `cleanupWorkspace` is restored too.
 */
export async function prepareWorkspace(root: string, preserve: string[] = []): Promise<void> {
  const keepRoot = `${root}.preserved`;

  if (preserve.length > 0) {
    for (const relativePath of preserve) {
      const source = path.join(root, relativePath);
      try {
        await stat(source);
      } catch {
        continue; // first visit, or the task never created it
      }
      const destination = path.join(keepRoot, relativePath);
      try {
        await mkdir(path.dirname(destination), { recursive: true });
        await rm(destination, { recursive: true, force: true });
        await rename(source, destination);
      } catch {
        // A database we cannot move is dropped rather than risking a half-copied one.
      }
    }
  }

  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  for (const relativePath of preserve) {
    const source = path.join(keepRoot, relativePath);
    try {
      await stat(source);
    } catch {
      continue;
    }
    const destination = path.join(root, relativePath);
    try {
      await mkdir(path.dirname(destination), { recursive: true });
      await rename(source, destination);
    } catch {
      // Ignored: the task starts with a fresh database.
    }
  }
  await rm(keepRoot, { recursive: true, force: true });
}

/** Writes the renderer's files into a fresh workspace. Returns the dedupe state. */
export async function materializeWorkspace(
  root: string,
  files: Record<string, string>
): Promise<WorkspaceWriteState> {
  const written: WorkspaceWriteState = new Map();

  for (const [relativePath, content] of Object.entries(files)) {
    if (!shouldWriteFile(relativePath, content).ok) continue;
    const target = resolveInsideRoot(root, relativePath);
    await writeFileAtomic(target, content);
    written.set(relativePath, content);
  }

  return written;
}

/**
 * Source-of-truth write-through. `written` holds what both sides last agreed on, so
 * a change that echoes back from the filesystem watcher is ignored instead of looping.
 * Files removed from the app state are removed from disk — but only files this module
 * wrote before, never a file a terminal command created and the editor has not seen yet.
 */
export async function writeWorkspaceFiles(
  root: string,
  files: Record<string, string>,
  written: WorkspaceWriteState
): Promise<void> {
  const desired = new Map<string, string>();
  for (const [relativePath, content] of Object.entries(files)) {
    if (!shouldWriteFile(relativePath, content).ok) continue;
    desired.set(relativePath, content);
  }

  for (const [relativePath, content] of desired) {
    if (written.get(relativePath) === content) continue;
    const target = resolveInsideRoot(root, relativePath);
    await writeFileAtomic(target, content);
    written.set(relativePath, content);
  }

  for (const relativePath of [...written.keys()]) {
    if (desired.has(relativePath)) continue;
    const target = resolveInsideRoot(root, relativePath);
    await rm(target, { force: true });
    await removeEmptyParents(root, path.dirname(target));
    written.delete(relativePath);
  }
}

async function removeEmptyParents(root: string, directory: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  let current = path.resolve(directory);
  while (current !== resolvedRoot) {
    const relative = path.relative(resolvedRoot, current);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return;
    try {
      const entries = await readdir(current);
      if (entries.length > 0) return;
      await rm(current, { recursive: true, force: true });
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}

/** Support files (Prisma's hidden helpers) bypass the editor's ignore list on purpose. */
export async function writeSupportFiles(
  root: string,
  files: Record<string, string>
): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    if (!relativePath.startsWith('.vinkup/')) continue;
    if (!isSafeRelativePath(relativePath)) continue;
    if (content.length > MAX_FILE_CHARS || looksBinary(content)) continue;
    await writeFileAtomic(resolveInsideRoot(root, relativePath), content);
  }
}

export async function readWorkspaceFile(root: string, relativePath: string): Promise<string> {
  if (isIgnoredPath(relativePath))
    throw new Error(`Refusing to read an ignored path: ${relativePath}`);
  const target = resolveInsideRoot(root, relativePath);
  const content = await readFile(target, 'utf8');
  if (content.length > MAX_FILE_CHARS) throw new Error(`${relativePath} is too large to open.`);
  if (looksBinary(content)) throw new Error(`${relativePath} is not a text file.`);
  return content;
}

/** Reads every editable text file back from disk, for the explicit "reload from disk" action. */
export async function reloadWorkspaceFromDisk(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  async function walk(directory: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (isIgnoredPath(relativePath)) continue;

      if (entry.isDirectory()) {
        await walk(path.join(directory, entry.name), relativePath);
        continue;
      }
      if (!entry.isFile() || !isTextExtension(relativePath)) continue;

      try {
        const target = resolveInsideRoot(root, relativePath);
        const info = await stat(target);
        if (info.size > MAX_FILE_CHARS) continue;
        const content = await readFile(target, 'utf8');
        if (looksBinary(content)) continue;
        files[relativePath] = content;
      } catch {
        // A file that disappears mid-walk is simply not part of the snapshot.
      }
    }
  }

  await walk(root, '');
  return files;
}

/** Used by the bundler: the same editable files, in memory. */
export async function readWorkspaceFiles(root: string): Promise<Record<string, string>> {
  return reloadWorkspaceFromDisk(root);
}

export async function workspaceDirectorySize(root: string): Promise<number> {
  let total = 0;
  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      try {
        const target = path.join(directory, entry.name);
        const info = await stat(target);
        if (entry.isDirectory()) await walk(target);
        else total += info.size;
      } catch {
        // ignore races
      }
    }
  }
  await walk(root);
  return total;
}

export async function cleanupWorkspace(root: string, preserve: string[] = []): Promise<void> {
  if (preserve.length > 0) {
    const keepRoot = `${root}.preserved`;
    for (const relativePath of preserve) {
      const source = path.join(root, relativePath);
      try {
        await stat(source);
      } catch {
        continue;
      }
      const destination = path.join(keepRoot, relativePath);
      try {
        await mkdir(path.dirname(destination), { recursive: true });
        await rm(destination, { recursive: true, force: true });
        await rename(source, destination);
      } catch {
        // The task starts with a fresh database next time.
      }
    }
  }
  await rm(root, { recursive: true, force: true });
}

export type WorkspaceWatcher = { close: () => void };

/**
 * Watches terminal-created and externally edited files. The callback only sees paths
 * whose disk content differs from what write-through last wrote, so editor saves never
 * bounce back into the editor.
 */
export function watchWorkspace(
  root: string,
  written: WorkspaceWriteState,
  onChange: (change: ExternalFileChange) => void
): WorkspaceWatcher {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let closed = false;

  const handle = (filename: string | Buffer | null): void => {
    if (closed || filename === null) return;
    const text = typeof filename === 'string' ? filename : filename.toString('utf8');
    const relativePath = text.replace(/^(\.\/|\/)+/, '').replace(/\\/g, '/');
    if (relativePath === '' || isIgnoredPath(relativePath)) return;
    if (!isSafeRelativePath(relativePath)) return;

    const pending = timers.get(relativePath);
    if (pending) clearTimeout(pending);
    timers.set(
      relativePath,
      setTimeout(() => {
        timers.delete(relativePath);
        void inspect(relativePath);
      }, WATCH_DELAY_MS)
    );
  };

  const inspect = async (relativePath: string): Promise<void> => {
    if (closed) return;
    let target: string;
    try {
      target = resolveInsideRoot(root, relativePath);
    } catch {
      return;
    }

    try {
      const info = await stat(target);
      if (!info.isFile()) return; // a folder itself; its children get their own events
      if (info.size > MAX_FILE_CHARS || !isTextExtension(relativePath)) return;
      const content = await readFile(target, 'utf8');
      if (looksBinary(content) || content.length > MAX_FILE_CHARS) return;
      if (written.get(relativePath) === content) return; // our own echo

      written.set(relativePath, content);
      onChange({ path: relativePath, content });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') return;
      written.delete(relativePath);
      onChange({ path: relativePath, content: null });
    }
  };

  let watcher: FSWatcher | null = null;
  try {
    watcher = watch(root, { recursive: true, persistent: false }, (_event, filename) => {
      handle(filename);
    });
    watcher.on('error', () => {
      // Watching is best effort; editing still works without live terminal sync.
    });
  } catch {
    // Some filesystems don't support recursive watching.
  }

  return {
    close() {
      if (closed) return;
      closed = true;
      watcher?.close();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}
