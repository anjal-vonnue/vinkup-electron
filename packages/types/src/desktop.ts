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
  window: {
    setFullscreen: (value: boolean) => Promise<boolean>;
    isFullscreen: () => Promise<boolean>;
    /** Returns an unsubscribe function. */
    onFullscreenChange: (listener: (isFullscreen: boolean) => void) => () => void;
  };
}
