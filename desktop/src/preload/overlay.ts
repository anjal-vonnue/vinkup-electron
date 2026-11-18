import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  BrowserAvailability,
  ResourcesAllowlist,
  ResourcesBrowserBounds,
  ResourcesBrowserState,
  ResourcesFindResult,
  SecondaryDisplayResourcesApi,
} from '@itp/types';

const resources: SecondaryDisplayResourcesApi = {
  getAllowlist: () =>
    ipcRenderer.invoke('secondary-resources:get-allowlist') as Promise<ResourcesAllowlist>,
  getState: () =>
    ipcRenderer.invoke('secondary-resources:get-state') as Promise<ResourcesBrowserState>,
  open: (bounds: ResourcesBrowserBounds) =>
    ipcRenderer.invoke('secondary-resources:open', bounds) as Promise<ResourcesBrowserState>,
  setBounds: (bounds: ResourcesBrowserBounds) =>
    ipcRenderer.invoke('secondary-resources:set-bounds', bounds) as Promise<void>,
  close: () => ipcRenderer.invoke('secondary-resources:close') as Promise<void>,
  home: () => ipcRenderer.invoke('secondary-resources:home') as Promise<void>,
  navigate: (input: string) =>
    ipcRenderer.invoke('secondary-resources:navigate', input) as Promise<ResourcesBrowserState>,
  goBack: () => ipcRenderer.invoke('secondary-resources:back') as Promise<void>,
  goForward: () => ipcRenderer.invoke('secondary-resources:forward') as Promise<void>,
  reload: () => ipcRenderer.invoke('secondary-resources:reload') as Promise<void>,
  stop: () => ipcRenderer.invoke('secondary-resources:stop') as Promise<void>,
  find: (query: string) => ipcRenderer.invoke('secondary-resources:find', query) as Promise<void>,
  findNext: (forward: boolean) =>
    ipcRenderer.invoke('secondary-resources:find-next', forward) as Promise<void>,
  stopFind: () => ipcRenderer.invoke('secondary-resources:stop-find') as Promise<void>,
  zoomIn: () => ipcRenderer.invoke('secondary-resources:zoom-in') as Promise<void>,
  zoomOut: () => ipcRenderer.invoke('secondary-resources:zoom-out') as Promise<void>,
  zoomReset: () => ipcRenderer.invoke('secondary-resources:zoom-reset') as Promise<void>,
  onChange: (listener: (state: ResourcesBrowserState) => void) => {
    const handler = (_event: IpcRendererEvent, state: ResourcesBrowserState): void =>
      listener(state);
    ipcRenderer.on('secondary-resources:state-changed', handler);
    return () => ipcRenderer.removeListener('secondary-resources:state-changed', handler);
  },
  onFindResult: (listener: (result: ResourcesFindResult) => void) => {
    const handler = (_event: IpcRendererEvent, result: ResourcesFindResult): void =>
      listener(result);
    ipcRenderer.on('secondary-resources:find-result', handler);
    return () => ipcRenderer.removeListener('secondary-resources:find-result', handler);
  },
  onFocusAddress: (listener: () => void) => {
    const handler = (): void => listener();
    ipcRenderer.on('secondary-resources:focus-address', handler);
    return () => ipcRenderer.removeListener('secondary-resources:focus-address', handler);
  },
  onOpenFind: (listener: () => void) => {
    const handler = (): void => listener();
    ipcRenderer.on('secondary-resources:open-find', handler);
    return () => ipcRenderer.removeListener('secondary-resources:open-find', handler);
  },
  onEscape: (listener: () => void) => {
    const handler = (): void => listener();
    ipcRenderer.on('secondary-resources:escape', handler);
    return () => ipcRenderer.removeListener('secondary-resources:escape', handler);
  },
};

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
  onAuthenticationChange: (listener: (authenticated: boolean, animate: boolean) => void) => {
    const handler = (_event: IpcRendererEvent, authenticated: boolean, animate: boolean): void => {
      listener(authenticated, animate);
    };
    ipcRenderer.on('display-overlay:auth-state', handler);
    return () => {
      ipcRenderer.removeListener('display-overlay:auth-state', handler);
    };
  },
  resources,
});
