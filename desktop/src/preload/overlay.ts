import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { BrowserAvailability } from '@itp/types';

contextBridge.exposeInMainWorld('vinkupDisplay', {
  setReferencesActive: (active: boolean) => {
    ipcRenderer.send('display-overlay:references-active', active);
  },
  setResourcesActive: (active: boolean) => {
    ipcRenderer.send('display-overlay:resources-active', active);
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
});
