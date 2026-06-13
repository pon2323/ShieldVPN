const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ShieldLauncher', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  meta: () => ipcRenderer.invoke('launcher:meta'),
  check: () => ipcRenderer.invoke('launcher:check'),
  downloadInstall: () => ipcRenderer.invoke('launcher:downloadInstall'),
  openClient: () => ipcRenderer.invoke('launcher:openClient'),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  onProgress: (callback) => ipcRenderer.on('launcher:progress', (_, data) => callback(data))
});
