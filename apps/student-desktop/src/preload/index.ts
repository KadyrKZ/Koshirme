import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopState, GuardAPI } from '../types';
const api: GuardAPI = {
  getState: () => ipcRenderer.invoke('guard:get-state'),
  screenPermission: () => ipcRenderer.invoke('guard:screen-permission'),
  onState(callback) {
    const listener = (_event: Electron.IpcRendererEvent, state: DesktopState) => callback(state);
    ipcRenderer.on('guard:state', listener);
    return () => ipcRenderer.removeListener('guard:state', listener);
  },
};
contextBridge.exposeInMainWorld('examguard', api);
