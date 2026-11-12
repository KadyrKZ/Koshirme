import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopState, GuardAPI, JoinInput } from '../types';
const api: GuardAPI = {
  getState: () => ipcRenderer.invoke('guard:get-state'),
  join: (input: JoinInput) => ipcRenderer.invoke('guard:join', input),
  start: () => ipcRenderer.invoke('guard:start'),
  screenPermission: () => ipcRenderer.invoke('guard:screen-permission'),
  copyPairingCode: () => ipcRenderer.invoke('guard:copy-pairing-code'),
  onState(callback) {
    const listener = (_event: Electron.IpcRendererEvent, state: DesktopState) => callback(state);
    ipcRenderer.on('guard:state', listener);
    return () => ipcRenderer.removeListener('guard:state', listener);
  },
};
contextBridge.exposeInMainWorld('examguard', api);
