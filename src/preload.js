const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  createTab: (url) => ipcRenderer.invoke('tab:create', url),
  closeTab: (tabId) => ipcRenderer.invoke('tab:close', tabId),
  switchTab: (tabId) => ipcRenderer.invoke('tab:switch', tabId),
  navigate: (url) => ipcRenderer.invoke('nav:go', url),
  goBack: () => ipcRenderer.invoke('nav:back'),
  goForward: () => ipcRenderer.invoke('nav:forward'),
  reload: () => ipcRenderer.invoke('nav:reload'),
  stop: () => ipcRenderer.invoke('nav:stop'),
  openDevTools: () => ipcRenderer.invoke('nav:devtools'),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  onTabUpdated: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('tab:updated', listener);
    return () => ipcRenderer.removeListener('tab:updated', listener);
  },
  onTabsChanged: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('tabs:changed', listener);
    return () => ipcRenderer.removeListener('tabs:changed', listener);
  }
});
