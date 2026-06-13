const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ShieldVPN', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  connect: (key) => ipcRenderer.invoke('vpn:start', key),
  disconnect: () => ipcRenderer.invoke('vpn:stop'),
  engineStatus: () => ipcRenderer.invoke('vpn:engineStatus'),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  onLog: (callback) => ipcRenderer.on('vpn:log', (_, line) => callback(line)),
  onState: (callback) => ipcRenderer.on('vpn:state', (_, state) => callback(state))
});
