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

/** Console levels the preview bridge may report. */
export type WorkspaceConsoleLevel = 'log' | 'info' | 'warn' | 'error';

export type WorkspaceRunKind = 'install' | 'dev';

export type BrowserAvailability = {
  mainResourcesActive: boolean;
  secondaryResourcesActive: boolean;
};

export interface SecondaryDisplayResourcesApi {
  getAllowlist: () => Promise<ResourcesAllowlist>;
  getState: () => Promise<ResourcesBrowserState>;
  open: (bounds: ResourcesBrowserBounds) => Promise<ResourcesBrowserState>;
  setBounds: (bounds: ResourcesBrowserBounds) => Promise<void>;
  close: () => Promise<void>;
  home: () => Promise<void>;
  navigate: (input: string) => Promise<ResourcesBrowserState>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  reload: () => Promise<void>;
  stop: () => Promise<void>;
  find: (query: string) => Promise<void>;
  findNext: (forward: boolean) => Promise<void>;
  stopFind: () => Promise<void>;
  zoomIn: () => Promise<void>;
  zoomOut: () => Promise<void>;
  zoomReset: () => Promise<void>;
  onChange: (listener: (state: ResourcesBrowserState) => void) => () => void;
  onFindResult: (listener: (result: ResourcesFindResult) => void) => () => void;
  onFocusAddress: (listener: () => void) => () => void;
  onOpenFind: (listener: () => void) => () => void;
  onEscape: (listener: () => void) => () => void;
}

/**
 * Events produced by the main-process workspace for one task. Everything carries the
 * task id so a runtime can ignore events from a workspace that was just closed.
 */
export type WorkspaceEvent =
  | {
      type: 'console';
      taskId: string;
      runId: string;
      level: WorkspaceConsoleLevel;
      args: string[];
      ts: number;
    }
  | { type: 'console-clear'; taskId: string; runId: string }
  | { type: 'preview-ready'; taskId: string; runId: string; url: string }
  | { type: 'file-changed'; taskId: string; path: string; content: string | null }
  | {
      type: 'run-output';
      taskId: string;
      kind: WorkspaceRunKind;
      stream: 'stdout' | 'stderr';
      data: string;
    }
  | { type: 'run-exited'; taskId: string; kind: WorkspaceRunKind; exitCode: number }
  | { type: 'server-ready'; taskId: string; port: number; url: string }
  | { type: 'server-closed'; taskId: string; port: number };

export type WorkspaceEnvironment = {
  /** e.g. "24.18.0"; null when Node is missing. */
  nodeVersion: string | null;
  /** A human-readable reason the host cannot run Node tasks, or null. */
  error: string | null;
};

export type WorkspaceOpenInput = {
  taskId: string;
  files: Record<string, string>;
  /** Hidden helpers written under .vinkup/ (Prisma support files). */
  supportFiles?: Record<string, string>;
};

export type WorkspaceOpenResult = WorkspaceEnvironment & {
  /** Loopback URL of the workspace's preview HTTP server. */
  previewUrl: string;
};

export type WorkspaceSyncInput = WorkspaceOpenInput;

export type TerminalOpenInput = {
  taskId: string;
  cols: number;
  rows: number;
};

export type TerminalOpenResult = {
  terminalId: string;
};

export type TerminalDataEvent = {
  terminalId: string;
  data: string;
};

export type TerminalExitEvent = {
  terminalId: string;
  exitCode: number;
};

export interface WorkspaceApi {
  open: (input: WorkspaceOpenInput) => Promise<WorkspaceOpenResult>;
  sync: (input: WorkspaceSyncInput) => Promise<void>;
  /** Reads every editable text file back from disk. */
  reload: (taskId: string) => Promise<Record<string, string>>;
  close: (taskId: string) => Promise<void>;
  getEnvironment: () => Promise<WorkspaceEnvironment>;
  /** Returns an unsubscribe function. */
  onEvent: (listener: (event: WorkspaceEvent) => void) => () => void;
}

export interface TerminalApi {
  open: (input: TerminalOpenInput) => Promise<TerminalOpenResult>;
  write: (terminalId: string, data: string) => Promise<void>;
  resize: (terminalId: string, cols: number, rows: number) => Promise<void>;
  close: (terminalId: string) => Promise<void>;
  /** Returns an unsubscribe function. */
  onData: (listener: (event: TerminalDataEvent) => void) => () => void;
  /** Returns an unsubscribe function. */
  onExit: (listener: (event: TerminalExitEvent) => void) => () => void;
}

export interface RunApi {
  /** Runs `npm install` in the task workspace; output arrives as run-output events. */
  install: (taskId: string) => Promise<void>;
  /** Types the command into the task's shell (or spawns it when no shell is open). */
  dev: (taskId: string, command: string) => Promise<void>;
  stop: (taskId: string) => Promise<void>;
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
    setDisplayTheme: (theme: 'light' | 'dark') => Promise<void>;
    isReferenceScreenFocused: () => Promise<boolean>;
    /** Returns an unsubscribe function. */
    onReferenceScreenFocusChange: (listener: (isFocused: boolean) => void) => () => void;
    getBrowserAvailability: () => Promise<BrowserAvailability>;
    /** Returns an unsubscribe function. */
    onBrowserAvailabilityChange: (
      listener: (availability: BrowserAvailability) => void
    ) => () => void;
    beginCertificatePrint: () => Promise<void>;
    endCertificatePrint: () => Promise<void>;
    /** Returns an unsubscribe function. */
    onFullscreenChange: (listener: (isFullscreen: boolean) => void) => () => void;
  };

  certificate: {
    savePdf: (fileName: string) => Promise<boolean>;
  };

  /** Host execution for task runtimes (files, preview server, shells, dev servers). */
  workspace: WorkspaceApi;
  terminal: TerminalApi;
  run: RunApi;

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
  /** Saves the printable trainee report as an A4 portrait PDF. */
  report: {
    savePdf: (fileName: string) => Promise<boolean>;
  };
}
