import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DesktopApi, DesktopAppInfo, DesktopAuthState } from '@itp/types';

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
};

contextBridge.exposeInMainWorld('desktop', api);
