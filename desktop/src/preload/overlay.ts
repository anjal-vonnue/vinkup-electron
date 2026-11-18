import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('vinkupDisplay', {
  setReferencesActive: (active: boolean) => {
    ipcRenderer.send('display-overlay:references-active', active);
  },
});
