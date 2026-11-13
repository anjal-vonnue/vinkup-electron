import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  DesktopApi,
  DesktopAppInfo,
  DesktopAuthState,
  ResourcesAllowlist,
  ResourcesBrowserState,
  ResourcesFindResult,
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
    onFullscreenChange: (listener: (isFullscreen: boolean) => void) => {
      const handler = (_event: IpcRendererEvent, isFullscreen: boolean): void => {
        listener(isFullscreen);
      };
      ipcRenderer.on('window:fullscreen-changed', handler);
      return () => {
        ipcRenderer.removeListener('window:fullscreen-changed', handler);
      };
    },
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
  },
};

contextBridge.exposeInMainWorld('desktop', api);
