import type { DesktopAuthState } from './auth';

/** Desktop platforms the shell is built for. Linux is the only supported target for now. */
export type DesktopPlatform = 'linux' | 'darwin' | 'win32';

export interface DesktopAppInfo {
  version: string;
  platform: DesktopPlatform;
  isPackaged: boolean;
}

/**
 * The only surface the renderer gets from the Electron main process.
 * Exposed by `desktop/src/preload/index.ts` as `window.desktop`.
 */
export interface DesktopApi {
  app: {
    getInfo: () => Promise<DesktopAppInfo>;
  };
  /**
   * Google sign-in runs in the system browser. The renderer only receives the
   * resulting user (never a token) and asks main to start, refresh or end the
   * session.
   */
  auth: {
    getState: () => Promise<DesktopAuthState>;
    login: () => Promise<DesktopAuthState>;
    cancel: () => Promise<void>;
    refresh: () => Promise<DesktopAuthState>;
    logout: () => Promise<void>;
    /** Returns an unsubscribe function. */
    onChange: (listener: (state: DesktopAuthState) => void) => () => void;
  };
  window: {
    setFullscreen: (value: boolean) => Promise<boolean>;
    isFullscreen: () => Promise<boolean>;
    /** Returns an unsubscribe function. */
    onFullscreenChange: (listener: (isFullscreen: boolean) => void) => () => void;
  };
  certificate: {
    savePdf: (fileName: string) => Promise<boolean>;
  };
  /** Saves the printable trainee report as an A4 portrait PDF. */
  report: {
    savePdf: (fileName: string) => Promise<boolean>;
  };
}
