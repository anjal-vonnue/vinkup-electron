import { app } from 'electron';
import path from 'node:path';
import { isLoopbackHost, portFromUrl } from './resources/allowlist';

export const APP_NAME = 'Vinkup';

/** Vite dev server, started by `npm run dev:desktop`. */
export const DEV_RENDERER_URL = 'http://localhost:5173';

/** Production API. Override with VINKUP_API_URL for a local backend. */
export const DEFAULT_API_URL = 'https://vinkup-electron.onrender.com';

/** In development the backend runs next to Vite (`npm run dev:backend`). */
export const DEFAULT_DEV_API_URL = 'http://localhost:3000';

/**
 * A fixed port keeps the renderer origin stable, so localStorage, IndexedDB
 * and cookies survive restarts. The single-instance lock stops two copies
 * fighting over it.
 */
export const DEFAULT_DESKTOP_PORT = 43110;

/** `prisma studio`'s default port; Prisma tasks start it from the workspace terminal. */
export const PRISMA_STUDIO_PORT = 5555;

/**
 * Loopback ports the app itself serves, used to let the Resources browser open
 * local dev pages: the backend (when `VINKUP_API_URL` points at this machine),
 * the Vite dev server and Prisma Studio. `LocalServicePorts` drops the ones that
 * are not accepting connections, so a stopped service cannot be opened.
 */
export function getLocalServicePortCandidates(isDev: boolean): number[] {
  const ports = new Set<number>([PRISMA_STUDIO_PORT]);

  const apiPort = loopbackPortOf(getApiUrl());
  if (apiPort !== null) ports.add(apiPort);

  if (isDev) {
    const rendererPort = loopbackPortOf(DEV_RENDERER_URL);
    if (rendererPort !== null) ports.add(rendererPort);
  }

  return [...ports];
}

function loopbackPortOf(rawUrl: string): number | null {
  try {
    const url = new URL(rawUrl);
    if (!isLoopbackHost(url.hostname)) return null;
    return portFromUrl(url);
  } catch {
    return null;
  }
}

export function getApiUrl(): string {
  const configured = process.env.VINKUP_API_URL?.trim();
  if (configured && configured.length > 0) return configured;
  return process.env.NODE_ENV === 'development' ? DEFAULT_DEV_API_URL : DEFAULT_API_URL;
}

export function getDesktopPort(): number {
  const configured = process.env.VINKUP_DESKTOP_PORT?.trim();
  if (!configured) return DEFAULT_DESKTOP_PORT;

  const port = Number(configured);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(
      `VINKUP_DESKTOP_PORT must be a port between 1024 and 65535, got "${configured}"`
    );
  }
  return port;
}

/**
 * Centrally hosted copy of the Resources allowlist. The app keeps its bundled
 * copy as a fallback, so an unreachable or invalid file is harmless.
 * Override with VINKUP_RESOURCES_ALLOWLIST_URL; set it to an empty string to
 * disable remote updates entirely.
 */
export function getResourcesAllowlistUrl(): string | null {
  const configured = process.env.VINKUP_RESOURCES_ALLOWLIST_URL;
  if (configured !== undefined) {
    const trimmed = configured.trim();
    return trimmed === '' ? null : trimmed;
  }
  return `${getApiUrl().replace(/\/+$/, '')}/api/resources/allowlist`;
}

/**
 * Unpackaged: `desktop/dist/main` -> repository root -> `frontend/dist`.
 * Packaged: electron-builder copies `frontend/dist` to `resources/frontend`.
 */
export function getFrontendDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'frontend');
  return path.resolve(__dirname, '../../../frontend/dist');
}
