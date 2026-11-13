import { contextBridge, ipcRenderer } from 'electron';

type AlertChoice = 'back' | 'exit';

contextBridge.exposeInMainWorld('displayAlert', {
  choose: (choice: AlertChoice): void => {
    ipcRenderer.send('display-alert:choice', choice);
  },
});
