import type { DesktopAuthState } from './auth';
import type {
  ResourcesAllowlist,
  ResourcesBrowserBounds,
  ResourcesBrowserState,
  ResourcesFindResult,
} from './resources';

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
  /**
   * The in-app browser used by the Resources page. Navigation is validated
   * against the allowlist in the main process, so the renderer cannot bypass it.
   */
  resources: {
    getAllowlist: () => Promise<ResourcesAllowlist>;
    getState: () => Promise<ResourcesBrowserState>;
    /** Positions and shows the embedded browser over the given rectangle. */
    open: (bounds: ResourcesBrowserBounds) => Promise<ResourcesBrowserState>;
    setBounds: (bounds: ResourcesBrowserBounds) => Promise<void>;
    /** Hides the browser but keeps the current page alive for the next visit. */
    close: () => Promise<void>;
    /** Returns to the approved-sites start page without clearing history. */
    home: () => Promise<void>;
    /** Accepts a URL or a search query; resolves it in the main process. */
    navigate: (input: string) => Promise<ResourcesBrowserState>;
    goBack: () => Promise<void>;
    goForward: () => Promise<void>;
    reload: () => Promise<void>;
    stop: () => Promise<void>;
    /** Highlights matches for the query in the current page. */
    find: (query: string) => Promise<void>;
    findNext: (forward: boolean) => Promise<void>;
    /** Clears find highlights and the match counter. */
    stopFind: () => Promise<void>;
    zoomIn: () => Promise<void>;
    zoomOut: () => Promise<void>;
    zoomReset: () => Promise<void>;
    /** Returns an unsubscribe function. */
    onChange: (listener: (state: ResourcesBrowserState) => void) => () => void;
    /** Returns an unsubscribe function. Ctrl+L from inside the page. */
    onFocusAddress: (listener: () => void) => () => void;
    /** Returns an unsubscribe function. Ctrl+F from inside the page. */
    onOpenFind: (listener: () => void) => () => void;
    /** Returns an unsubscribe function. Match updates from the find bar. */
    onFindResult: (listener: (result: ResourcesFindResult) => void) => () => void;
    /** Returns an unsubscribe function. Esc from inside the page. */
    onEscape: (listener: () => void) => () => void;
  };
}
