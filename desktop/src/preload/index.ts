import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DesktopApi, DesktopAppInfo } from '@itp/types';

const api: DesktopApi = {
  app: {
    getInfo: () => ipcRenderer.invoke('app:get-info') as Promise<DesktopAppInfo>,
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
