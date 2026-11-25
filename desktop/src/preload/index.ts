import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  DesktopApi,
  DesktopAppInfo,
  DesktopAuthState,
  LighthouseAuditResult,
  ResourcesAllowlist,
  ResourcesBrowserState,
  ResourcesFindResult,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalOpenResult,
  WorkspaceEnvironment,
  WorkspaceEvent,
  WorkspaceOpenInput,
  WorkspaceOpenResult,
  WorkspaceSyncInput,
  BrowserAvailability,
} from '@itp/types';

const api: DesktopApi = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:get-info') as Promise<DesktopAppInfo>,
  },
  auth: {
    getState: () => ipcRenderer.invoke('auth:get-state') as Promise<DesktopAuthState>,
    login: () => ipcRenderer.invoke('auth:login') as Promise<DesktopAuthState>,
    cancel: () => ipcRenderer.invoke('auth:cancel') as Promise<void>,
    refresh: () => ipcRenderer.invoke('auth:refresh') as Promise<DesktopAuthState>,
    logout: () => ipcRenderer.invoke('auth:logout') as Promise<void>,
    onChange: (listener: (state: DesktopAuthState) => void) => {
      const handler = (_event: IpcRendererEvent, state: DesktopAuthState): void => {
        listener(state);
      };
      ipcRenderer.on('auth:state-changed', handler);
      return () => {
        ipcRenderer.removeListener('auth:state-changed', handler);
      };
    },
  },
  window: {
    setFullscreen: (value: boolean) =>
      ipcRenderer.invoke('window:set-fullscreen', value) as Promise<boolean>,
    isFullscreen: () => ipcRenderer.invoke('window:is-fullscreen') as Promise<boolean>,
    setDisplayTheme: (theme) =>
      ipcRenderer.invoke('window:set-display-theme', theme) as Promise<void>,
    isAllowedOverlayContentFocused: () =>
      ipcRenderer.invoke('window:is-allowed-overlay-content-focused') as Promise<boolean>,
    onAllowedOverlayContentFocusChange: (listener: (isFocused: boolean) => void) => {
      const handler = (_event: IpcRendererEvent, isFocused: boolean): void => {
        listener(isFocused);
      };
      ipcRenderer.on('window:allowed-overlay-content-focus-changed', handler);
      return () => {
        ipcRenderer.removeListener('window:allowed-overlay-content-focus-changed', handler);
      };
    },
    getBrowserAvailability: () =>
      ipcRenderer.invoke('browser:get-availability') as Promise<BrowserAvailability>,
    onBrowserAvailabilityChange: (listener: (availability: BrowserAvailability) => void) => {
      const handler = (_event: IpcRendererEvent, availability: BrowserAvailability): void => {
        listener(availability);
      };
      ipcRenderer.on('browser:availability-changed', handler);
      return () => {
        ipcRenderer.removeListener('browser:availability-changed', handler);
      };
    },
    onFullscreenChange: (listener: (isFullscreen: boolean) => void) => {
      const handler = (_event: IpcRendererEvent, isFullscreen: boolean): void => {
        listener(isFullscreen);
      };
      ipcRenderer.on('window:fullscreen-changed', handler);
      return () => {
        ipcRenderer.removeListener('window:fullscreen-changed', handler);
      };
    },
    onOwnWindowActivity: (listener: () => void) => {
      const handler = (): void => {
        listener();
      };
      ipcRenderer.on('window:own-window-activity', handler);
      return () => {
        ipcRenderer.removeListener('window:own-window-activity', handler);
      };
    },
    onScreenLockChange: (listener: (locked: boolean) => void) => {
      const handler = (_event: IpcRendererEvent, locked: boolean): void => {
        listener(locked);
      };
      ipcRenderer.on('power:screen-lock-changed', handler);
      return () => {
        ipcRenderer.removeListener('power:screen-lock-changed', handler);
      };
    },
  },

  certificate: {
    savePdf: (fileName: string) =>
      ipcRenderer.invoke('certificate:save-pdf', fileName) as Promise<{
        fileName: string;
        location: string;
      }>,
  },

  workspace: {
    open: (input: WorkspaceOpenInput) =>
      ipcRenderer.invoke('workspace:open', input) as Promise<WorkspaceOpenResult>,
    sync: (input: WorkspaceSyncInput) =>
      ipcRenderer.invoke('workspace:sync', input) as Promise<void>,
    reload: (taskId: string) =>
      ipcRenderer.invoke('workspace:reload', taskId) as Promise<Record<string, string>>,
    close: (taskId: string) => ipcRenderer.invoke('workspace:close', taskId) as Promise<void>,
    getEnvironment: () =>
      ipcRenderer.invoke('workspace:get-environment') as Promise<WorkspaceEnvironment>,
    onEvent: (listener: (event: WorkspaceEvent) => void) => {
      const handler = (_event: IpcRendererEvent, payload: WorkspaceEvent): void => {
        listener(payload);
      };
      ipcRenderer.on('workspace:event', handler);
      return () => {
        ipcRenderer.removeListener('workspace:event', handler);
      };
    },
  },
  terminal: {
    open: (input) => ipcRenderer.invoke('terminal:open', input) as Promise<TerminalOpenResult>,
    write: (taskId: string, terminalId: string, data: string) =>
      ipcRenderer.invoke('terminal:write', taskId, terminalId, data) as Promise<void>,
    resize: (taskId: string, terminalId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', taskId, terminalId, cols, rows) as Promise<void>,
    close: (taskId: string, terminalId: string) =>
      ipcRenderer.invoke('terminal:close', taskId, terminalId) as Promise<void>,
    onData: (listener: (event: TerminalDataEvent) => void) => {
      const handler = (_event: IpcRendererEvent, payload: TerminalDataEvent): void => {
        listener(payload);
      };
      ipcRenderer.on('terminal:data', handler);
      return () => {
        ipcRenderer.removeListener('terminal:data', handler);
      };
    },
    onExit: (listener: (event: TerminalExitEvent) => void) => {
      const handler = (_event: IpcRendererEvent, payload: TerminalExitEvent): void => {
        listener(payload);
      };
      ipcRenderer.on('terminal:exit', handler);
      return () => {
        ipcRenderer.removeListener('terminal:exit', handler);
      };
    },
  },
  audit: {
    run: (taskId: string, pagePath?: string) =>
      ipcRenderer.invoke('lighthouse:run', taskId, pagePath) as Promise<LighthouseAuditResult>,
  },
  run: {
    install: (taskId: string) => ipcRenderer.invoke('run:install', taskId) as Promise<void>,
    dev: (taskId: string, command: string, terminalId?: string) =>
      ipcRenderer.invoke('run:dev', taskId, command, terminalId) as Promise<void>,
    stop: (taskId: string, terminalId?: string) =>
      ipcRenderer.invoke('run:stop', taskId, terminalId) as Promise<void>,
  },
  resources: {
    getAllowlist: () =>
      ipcRenderer.invoke('resources:get-allowlist') as Promise<ResourcesAllowlist>,
    getState: () => ipcRenderer.invoke('resources:get-state') as Promise<ResourcesBrowserState>,
    open: (bounds) =>
      ipcRenderer.invoke('resources:open', bounds) as Promise<ResourcesBrowserState>,
    setBounds: (bounds) => ipcRenderer.invoke('resources:set-bounds', bounds) as Promise<void>,
    close: () => ipcRenderer.invoke('resources:close') as Promise<void>,
    home: () => ipcRenderer.invoke('resources:home') as Promise<void>,
    navigate: (input: string) =>
      ipcRenderer.invoke('resources:navigate', input) as Promise<ResourcesBrowserState>,
    goBack: () => ipcRenderer.invoke('resources:back') as Promise<void>,
    goForward: () => ipcRenderer.invoke('resources:forward') as Promise<void>,
    reload: () => ipcRenderer.invoke('resources:reload') as Promise<void>,
    stop: () => ipcRenderer.invoke('resources:stop') as Promise<void>,
    find: (query: string) => ipcRenderer.invoke('resources:find', query) as Promise<void>,
    findNext: (forward: boolean) =>
      ipcRenderer.invoke('resources:find-next', forward) as Promise<void>,
    stopFind: () => ipcRenderer.invoke('resources:stop-find') as Promise<void>,
    zoomIn: () => ipcRenderer.invoke('resources:zoom-in') as Promise<void>,
    zoomOut: () => ipcRenderer.invoke('resources:zoom-out') as Promise<void>,
    zoomReset: () => ipcRenderer.invoke('resources:zoom-reset') as Promise<void>,
    onChange: (listener: (state: ResourcesBrowserState) => void) => {
      const handler = (_event: IpcRendererEvent, state: ResourcesBrowserState): void => {
        listener(state);
      };
      ipcRenderer.on('resources:state-changed', handler);
      return () => {
        ipcRenderer.removeListener('resources:state-changed', handler);
      };
    },
    onFocusAddress: (listener: () => void) => {
      const handler = (): void => {
        listener();
      };
      ipcRenderer.on('resources:focus-address', handler);
      return () => {
        ipcRenderer.removeListener('resources:focus-address', handler);
      };
    },

    onOpenFind: (listener: () => void) => {
      const handler = (): void => {
        listener();
      };
      ipcRenderer.on('resources:open-find', handler);
      return () => {
        ipcRenderer.removeListener('resources:open-find', handler);
      };
    },
    onFindResult: (listener: (result: ResourcesFindResult) => void) => {
      const handler = (_event: IpcRendererEvent, result: ResourcesFindResult): void => {
        listener(result);
      };
      ipcRenderer.on('resources:find-result', handler);
      return () => {
        ipcRenderer.removeListener('resources:find-result', handler);
      };
    },
    onEscape: (listener: () => void) => {
      const handler = (): void => {
        listener();
      };
      ipcRenderer.on('resources:escape', handler);
      return () => {
        ipcRenderer.removeListener('resources:escape', handler);
      };
    },
    onActivity: (listener: () => void) => {
      const handler = (): void => listener();
      ipcRenderer.on('resources:activity', handler);
      return () => {
        ipcRenderer.removeListener('resources:activity', handler);
      };
    },
  },
  report: {
    savePdf: (fileName: string) =>
      ipcRenderer.invoke('report:save-pdf', fileName) as Promise<boolean>,
  },
};

contextBridge.exposeInMainWorld('desktop', api);
