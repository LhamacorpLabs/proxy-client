let isInitialized = false;
let currentSettings = null;
let proxyEnabled = false;

async function initialize() {
  if (isInitialized) return;

  try {
    if (typeof authService !== 'undefined') {
      await authService.init();
    }

    currentSettings = await getSettings();
    proxyEnabled = currentSettings.autoConnect;

    setupProxyRequestHandler();
    browser.storage.onChanged.addListener(handleSettingsChange);
    setupContextMenu();

    isInitialized = true;
  } catch (error) {
    console.error('ProxyAuth: Initialization failed:', error);
  }
}

async function getSettings() {
  const defaults = {
    authServerUrl: 'https://example.com',
    username: '',
    password: '',
    proxyHost: 'localhost',
    proxyPort: 1080,
    autoConnect: false,
    refreshMargin: 3600
  };

  const result = await browser.storage.local.get(Object.keys(defaults));
  return { ...defaults, ...result };
}

function setupProxyRequestHandler() {
  browser.proxy.onRequest.addListener(handleProxyRequest, { urls: ['<all_urls>'] });
  browser.proxy.onError.addListener((error) => {
    console.error('ProxyAuth: Proxy error:', error.message);
  });
}

async function handleProxyRequest(requestInfo) {
  if (!proxyEnabled) {
    return { type: 'direct' };
  }

  const settings = await getSettings();

  try {
    const url = new URL(requestInfo.url);
    if (['localhost', '127.0.0.1'].includes(url.hostname)) {
      return { type: 'direct' };
    }
  } catch (e) {}

  let token;
  try {
    token = await authService.getToken();
    if (!token) {
      return { type: 'direct' };
    }
  } catch (error) {
    return { type: 'direct' };
  }

  return {
    type: 'socks',
    host: settings.proxyHost,
    port: parseInt(settings.proxyPort),
    username: settings.username,
    password: token,
    proxyDNS: true
  };
}

async function configureProxy() {
  const settings = await getSettings();

  if (!settings.proxyHost || !settings.proxyPort) {
    console.error('ProxyAuth: Invalid proxy configuration');
    return;
  }

  proxyEnabled = true;
}

async function clearProxy() {
  proxyEnabled = false;
}

async function fetchAvailableServers() {
  const token = await authService.getToken();
  if (!token) {
    throw new Error('Authentication required to fetch servers');
  }

  const response = await fetch('https://proxy-manager.lhamacorp.com/api/servers', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch servers: ${response.status} ${response.statusText}`);
  }

  const servers = await response.json();
  return servers.filter(server => server.isActive);
}

async function handleSettingsChange(changes, area) {
  if (area !== 'local') return;

  currentSettings = await getSettings();

  if ('autoConnect' in changes) {
    if (changes.autoConnect.newValue) {
      await configureProxy();
    } else {
      await clearProxy();
    }
  }

  if (('proxyHost' in changes || 'proxyPort' in changes) && currentSettings.autoConnect) {
    await configureProxy();
  }
}

function setupContextMenu() {
  try {
    browser.contextMenus.create({
      id: 'proxy-toggle',
      title: 'Toggle Proxy Connection',
      contexts: ['browser_action']
    });

    browser.contextMenus.onClicked.addListener(async (info) => {
      if (info.menuItemId === 'proxy-toggle') {
        const settings = await getSettings();
        const newAutoConnect = !settings.autoConnect;

        await browser.storage.local.set({ autoConnect: newAutoConnect });

        browser.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-48.png',
          title: 'Lhamacorp Proxy Client',
          message: `Proxy ${newAutoConnect ? 'enabled' : 'disabled'}`
        });
      }
    });
  } catch (error) {
    console.error('ProxyAuth: Context menu setup failed:', error);
  }
}

browser.runtime.onMessage.addListener(async (message) => {
  switch (message.action) {
    case 'getStatus':
      const status = authService.getStatus();
      const settings = await getSettings();
      status.hasCredentials = !!(settings.username && settings.password);
      status.proxyConfigured = proxyEnabled;
      return Promise.resolve(status);

    case 'authenticate':
      try {
        await authService.authenticate(message.username, message.password, message.authServerUrl);
        return Promise.resolve({ success: true });
      } catch (error) {
        return Promise.resolve({ success: false, error: error.message });
      }

    case 'logout':
      try {
        await authService.logout();
        return Promise.resolve({ success: true });
      } catch (error) {
        return Promise.resolve({ success: false, error: error.message });
      }

    case 'toggleProxy':
      try {
        const settings = await getSettings();
        const newAutoConnect = !settings.autoConnect;
        await browser.storage.local.set({ autoConnect: newAutoConnect });

        if (newAutoConnect) {
          await configureProxy();
        } else {
          await clearProxy();
        }

        return Promise.resolve({ success: true, enabled: newAutoConnect });
      } catch (error) {
        return Promise.resolve({ success: false, error: error.message });
      }

    case 'getServers':
      try {
        const servers = await fetchAvailableServers();
        return Promise.resolve({ success: true, servers });
      } catch (error) {
        return Promise.resolve({ success: false, error: error.message });
      }

    case 'selectServer':
      try {
        await browser.storage.local.set({
          proxyHost: message.host,
          proxyPort: message.port
        });
        return Promise.resolve({ success: true });
      } catch (error) {
        return Promise.resolve({ success: false, error: error.message });
      }

    case 'testConnection':
      try {
        const settings = await getSettings();

        if (!settings.proxyHost || !settings.proxyPort) {
          throw new Error('Proxy host and port must be configured');
        }

        const token = await authService.getToken();
        if (!token) {
          throw new Error('No valid authentication token available');
        }

        const msg = proxyEnabled
          ? `Proxy is configured and ready: ${settings.proxyHost}:${settings.proxyPort}`
          : `Proxy is ready but not enabled: ${settings.proxyHost}:${settings.proxyPort}`;

        return Promise.resolve({ success: true, message: msg });
      } catch (error) {
        return Promise.resolve({ success: false, error: error.message });
      }

    default:
      return Promise.resolve({ success: false, error: 'Unknown action' });
  }
});

browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: 'Lhamacorp Proxy Client Installed',
      message: 'Click the extension icon to configure your proxy settings.'
    });

    browser.runtime.openOptionsPage();
  }
});

browser.runtime.onStartup.addListener(() => {
  initialize();
});

initialize();
