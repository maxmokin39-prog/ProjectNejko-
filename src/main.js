const { app, BrowserWindow, WebContentsView, BrowserView, ipcMain, shell } = require('electron');
const path = require('path');

const CHROME_HEIGHT = 82;
let mainWindow = null;
let tabs = new Map();
let tabCounter = 1;
let activeTabId = null;

const NEW_TAB_URL = `file://${path.join(__dirname, 'pages', 'newtab.html').replace(/\\/g, '/')}`;

function getChromiumVersion() {
  return process.versions.chrome || '130+';
}

function updateActiveViewBounds() {
  if (!mainWindow || !activeTabId) return;
  const activeTab = tabs.get(activeTabId);
  if (!activeTab || !activeTab.view) return;

  const [width, height] = mainWindow.getContentSize();
  const contentBounds = {
    x: 0,
    y: CHROME_HEIGHT,
    width: Math.max(100, width),
    height: Math.max(100, height - CHROME_HEIGHT)
  };

  if (activeTab.view.setBounds) {
    activeTab.view.setBounds(contentBounds);
  }
}

function notifyTabsChanged() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const tabList = Array.from(tabs.values()).map(t => ({
    id: t.id,
    url: t.url,
    title: t.title,
    favicon: t.favicon,
    isLoading: t.isLoading,
    canGoBack: t.canGoBack,
    canGoForward: t.canGoForward
  }));

  mainWindow.webContents.send('tabs:changed', {
    tabs: tabList,
    activeTabId
  });
}

function notifyTabUpdated(tab) {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  mainWindow.webContents.send('tab:updated', {
    id: tab.id,
    url: tab.url,
    title: tab.title,
    favicon: tab.favicon,
    isLoading: tab.isLoading,
    canGoBack: tab.canGoBack,
    canGoForward: tab.canGoForward
  });
}

function createTab(initialUrl = NEW_TAB_URL) {
  const tabId = tabCounter++;
  
  let view;
  const webPrefs = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true
  };

  const useWebContentsView = typeof WebContentsView !== 'undefined';
  if (useWebContentsView) {
    view = new WebContentsView({ webPreferences: webPrefs });
  } else {
    view = new BrowserView({ webPreferences: webPrefs });
  }

  const tabWebContents = view.webContents;

  const tab = {
    id: tabId,
    view,
    url: initialUrl,
    title: 'New Tab',
    favicon: '',
    isLoading: true,
    canGoBack: false,
    canGoForward: false
  };

  tabs.set(tabId, tab);

  // Set window open handler to open in new tab instead of popup window
  tabWebContents.setWindowOpenHandler(({ url }) => {
    createTab(url);
    return { action: 'deny' };
  });

  // Track loading and navigation
  tabWebContents.on('did-start-loading', () => {
    tab.isLoading = true;
    notifyTabUpdated(tab);
  });

  tabWebContents.on('did-stop-loading', () => {
    tab.isLoading = false;
    tab.canGoBack = tabWebContents.canGoBack();
    tab.canGoForward = tabWebContents.canGoForward();
    tab.title = tabWebContents.getTitle() || 'New Tab';
    tab.url = tabWebContents.getURL();
    notifyTabUpdated(tab);
  });

  tabWebContents.on('page-title-updated', (e, title) => {
    tab.title = title;
    notifyTabUpdated(tab);
  });

  tabWebContents.on('page-favicon-updated', (e, favicons) => {
    if (favicons && favicons.length > 0) {
      tab.favicon = favicons[0];
      notifyTabUpdated(tab);
    }
  });

  tabWebContents.on('did-navigate', (e, url) => {
    tab.url = url;
    tab.canGoBack = tabWebContents.canGoBack();
    tab.canGoForward = tabWebContents.canGoForward();
    notifyTabUpdated(tab);
  });

  tabWebContents.on('did-navigate-in-page', (e, url) => {
    tab.url = url;
    tab.canGoBack = tabWebContents.canGoBack();
    tab.canGoForward = tabWebContents.canGoForward();
    notifyTabUpdated(tab);
  });

  // Load URL
  tabWebContents.loadURL(initialUrl).catch(err => {
    console.error(`Failed to load ${initialUrl}:`, err.message);
  });

  // Switch to the newly created tab
  switchToTab(tabId);
  return tabId;
}

function switchToTab(tabId) {
  if (!tabs.has(tabId)) return;
  const newTab = tabs.get(tabId);
  const oldTab = activeTabId ? tabs.get(activeTabId) : null;

  const useWebContentsView = typeof WebContentsView !== 'undefined';

  if (oldTab && oldTab.view) {
    if (useWebContentsView) {
      mainWindow.contentView.removeChildView(oldTab.view);
    } else {
      mainWindow.removeBrowserView(oldTab.view);
    }
  }

  activeTabId = tabId;

  if (useWebContentsView) {
    mainWindow.contentView.addChildView(newTab.view);
  } else {
    mainWindow.addBrowserView(newTab.view);
  }

  updateActiveViewBounds();
  notifyTabsChanged();
  notifyTabUpdated(newTab);
}

function closeTab(tabId) {
  if (!tabs.has(tabId)) return;
  const closingTab = tabs.get(tabId);

  const useWebContentsView = typeof WebContentsView !== 'undefined';

  if (closingTab.view) {
    if (useWebContentsView && activeTabId === tabId) {
      mainWindow.contentView.removeChildView(closingTab.view);
    } else if (!useWebContentsView && activeTabId === tabId) {
      mainWindow.removeBrowserView(closingTab.view);
    }
    closingTab.view.webContents.close();
  }

  tabs.delete(tabId);

  if (tabs.size === 0) {
    // If all tabs are closed, create a new one
    createTab();
  } else if (activeTabId === tabId) {
    // Switch to the last available tab
    const remainingTabs = Array.from(tabs.keys());
    switchToTab(remainingTabs[remainingTabs.length - 1]);
  } else {
    notifyTabsChanged();
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 500,
    title: 'ProjectNejko Pre-Alpha V01.0.0',
    backgroundColor: '#161922',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  mainWindow.on('resize', () => {
    updateActiveViewBounds();
  });

  mainWindow.on('maximize', () => {
    setTimeout(updateActiveViewBounds, 50);
  });

  mainWindow.on('unmaximize', () => {
    setTimeout(updateActiveViewBounds, 50);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    tabs.clear();
  });
}

// IPC Handlers
ipcMain.handle('tab:create', (e, url) => {
  return createTab(url || NEW_TAB_URL);
});

ipcMain.handle('tab:close', (e, tabId) => {
  closeTab(tabId);
});

ipcMain.handle('tab:switch', (e, tabId) => {
  switchToTab(tabId);
});

ipcMain.handle('nav:go', (e, url) => {
  if (!activeTabId || !tabs.has(activeTabId)) return;
  const tab = tabs.get(activeTabId);
  const target = (url === 'about:blank' || !url) ? NEW_TAB_URL : url;
  tab.view.webContents.loadURL(target);
});

ipcMain.handle('nav:back', () => {
  if (!activeTabId || !tabs.has(activeTabId)) return;
  const tab = tabs.get(activeTabId);
  if (tab.view.webContents.canGoBack()) {
    tab.view.webContents.goBack();
  }
});

ipcMain.handle('nav:forward', () => {
  if (!activeTabId || !tabs.has(activeTabId)) return;
  const tab = tabs.get(activeTabId);
  if (tab.view.webContents.canGoForward()) {
    tab.view.webContents.goForward();
  }
});

ipcMain.handle('nav:reload', () => {
  if (!activeTabId || !tabs.has(activeTabId)) return;
  const tab = tabs.get(activeTabId);
  tab.view.webContents.reload();
});

ipcMain.handle('nav:stop', () => {
  if (!activeTabId || !tabs.has(activeTabId)) return;
  const tab = tabs.get(activeTabId);
  tab.view.webContents.stop();
});

ipcMain.handle('nav:devtools', () => {
  if (!activeTabId || !tabs.has(activeTabId)) return;
  const tab = tabs.get(activeTabId);
  tab.view.webContents.toggleDevTools();
});

ipcMain.handle('app:info', () => {
  return {
    name: 'ProjectNejko',
    version: 'Pre-Alpha V01.0.0',
    chromiumVersion: getChromiumVersion(),
    electronVersion: process.versions.electron
  };
});

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
