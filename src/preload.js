'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  scan: () => ipcRenderer.invoke('scan'),
  toggle: (item, enable) => ipcRenderer.invoke('toggle', { item, enable }),
  openKey: (regPath) => ipcRenderer.invoke('openKey', regPath),
  openPath: (filePath) => ipcRenderer.invoke('openPath', filePath),
  restartExplorer: () => ipcRenderer.invoke('restartExplorer'),
  openBackups: () => ipcRenderer.invoke('openBackups'),
  history: () => ipcRenderer.invoke('history'),
  elevate: () => ipcRenderer.invoke('elevate'),
  minimize: () => ipcRenderer.send('win:minimize'),
  close: () => ipcRenderer.send('win:close')
});
