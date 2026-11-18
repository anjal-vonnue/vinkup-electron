import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const LOGIN_PATH_TIMEOUT_MS = 2_000;
const NODE_VERSION_TIMEOUT_MS = 2_000;
const MIN_NODE_MAJOR = 22;

/**
 * The only process environment values that reach trainee code. Everything else —
 * API tokens, cookies, the desktop session — stays in the main process.
 */
const ALLOWED_ENV_KEYS = [
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'NODE_ENV',
  'SHELL',
  'USER',
  'LOGNAME',
  'TMPDIR',
  'TEMP',
  'TMP',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
] as const;

export type HostEnvironment = {
  /** Login-shell PATH, merged with the PATH Electron inherited. */
  path: string;
  /** Absolute path to the student's login shell. */
  shell: string;
  /** The allowlisted environment, ready to pass to spawn(). */
  env: NodeJS.ProcessEnv;
  /** e.g. "24.18.0"; null when node is missing or unreadable. */
  nodeVersion: string | null;
  /** A human-readable reason the host cannot run Node tasks, or null. */
  error: string | null;
};

/** Takes only the allowlisted keys from a process environment. */
export function buildSafeEnv(
  source: NodeJS.ProcessEnv,
  overrides: NodeJS.ProcessEnv = {}
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ALLOWED_ENV_KEYS) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) env[key] = value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    // Overrides go through the same allowlist, so a caller cannot smuggle a token in.
    if ((ALLOWED_ENV_KEYS as readonly string[]).includes(key)) env[key] = value;
  }
  return env;
}

/** Electron launched from a .desktop file does not see the login shell's PATH. */
export async function resolveLoginPath(): Promise<string> {
  const inherited = process.env.PATH ?? '';
  try {
    const { stdout } = await execFileAsync('/bin/bash', ['-lic', 'printf %s "$PATH"'], {
      timeout: LOGIN_PATH_TIMEOUT_MS,
      maxBuffer: 64 * 1024,
    });
    const loginPath = stdout.trim();
    if (loginPath !== '') {
      const parts = [...loginPath.split(':'), ...inherited.split(':')].filter(Boolean);
      return [...new Set(parts)].join(':');
    }
  } catch {
    // No bash, a locked-down profile, or a timeout: the inherited PATH is still usable.
  }
  return inherited;
}

function parseNodeMajor(version: string): number | null {
  const match = /^v(\d+)\./.exec(version.trim());
  return match ? Number(match[1]) : null;
}

/** Runs `node --version` through the resolved PATH and enforces the minimum version. */
export async function verifyNodeVersion(pathValue: string): Promise<{
  nodeVersion: string | null;
  error: string | null;
}> {
  try {
    const { stdout } = await execFileAsync('node', ['--version'], {
      timeout: NODE_VERSION_TIMEOUT_MS,
      env: buildSafeEnv(process.env, { PATH: pathValue }),
    });
    const version = stdout.trim();
    const major = parseNodeMajor(version);
    if (major === null) {
      return { nodeVersion: null, error: 'Could not read the installed Node.js version.' };
    }
    if (major < MIN_NODE_MAJOR) {
      return {
        nodeVersion: version,
        error: `Node.js ${version} is too old. Vinkup needs Node.js ${MIN_NODE_MAJOR} or newer.`,
      };
    }
    return { nodeVersion: version, error: null };
  } catch {
    return {
      nodeVersion: null,
      error: `Node.js ${MIN_NODE_MAJOR}+ was not found. Install Node.js and reopen Vinkup.`,
    };
  }
}

let cached: Promise<HostEnvironment> | null = null;

/**
 * Resolved once at startup (or on first use in tests). The renderer gets a clear
 * error card rather than a silently bundled Node runtime.
 */
export function resolveHostEnvironment(): Promise<HostEnvironment> {
  if (!cached) {
    cached = (async () => {
      const pathValue = await resolveLoginPath();
      const { nodeVersion, error } = await verifyNodeVersion(pathValue);
      return {
        path: pathValue,
        shell: process.env.SHELL?.trim() || '/bin/bash',
        env: buildSafeEnv(process.env, { PATH: pathValue, TERM: 'xterm-256color' }),
        nodeVersion,
        error,
      };
    })();
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}

/** Test seam: forget the cached environment after changing process.env. */
export function resetHostEnvironmentForTests(): void {
  cached = null;
}

export function hostProcessEnv(
  host: HostEnvironment,
  overrides: NodeJS.ProcessEnv = {}
): NodeJS.ProcessEnv {
  return buildSafeEnv(host.env, { ...overrides, PATH: host.path });
}
