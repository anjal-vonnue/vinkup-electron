import { app } from 'electron';
import path from 'node:path';

export const APP_NAME = 'Vinkup';

/** Vite dev server, started by `npm run dev:desktop`. */
export const DEV_RENDERER_URL = 'http://localhost:5173';

/** Production API. Override with VINKUP_API_URL for a local backend. */
export const DEFAULT_API_URL = 'https://vinkup-backend.onrender.com';

/**
 * A fixed port keeps the renderer origin stable, so localStorage, IndexedDB
 * and cookies survive restarts. The single-instance lock stops two copies
 * fighting over it.
 */
export const DEFAULT_DESKTOP_PORT = 43110;

export function getApiUrl(): string {
  const configured = process.env.VINKUP_API_URL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_API_URL;
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
 * Unpackaged: `desktop/dist/main` -> repository root -> `frontend/dist`.
 * Packaged: electron-builder copies `frontend/dist` to `resources/frontend`.
 */
export function getFrontendDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'frontend');
  return path.resolve(__dirname, '../../../frontend/dist');
}
