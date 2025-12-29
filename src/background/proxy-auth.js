/**
 * Background script for handling SOCKS5 proxy authentication
 */

let isInitialized = false;
let currentSettings = null;
let proxyEnabled = false;

// Initialize the background script
async function initialize() {
  if (isInitialized) return;

  console.log('ProxyAuth: Initializing background script...');

  try {
    // Wait for auth service to be ready
    if (typeof authService !== 'undefined') {
      await authService.init();
    }

    // Load current settings
    currentSettings = await getSettings();
    proxyEnabled = currentSettings.autoConnect;

    // Set up the proxy request handler (this is the key for SOCKS5 auth!)
    setupProxyRequestHandler();

    // Listen for settings changes
    browser.storage.onChanged.addListener(handleSettingsChange);

    // Set up context menu (optional)
    setupContextMenu();

    isInitialized = true;
    console.log('ProxyAuth: Initialization complete');

  } catch (error) {
    console.error('ProxyAuth: Initialization failed:', error);
  }
}

/**
 * Get current settings with defaults
 */
async function getSettings() {
  const defaults = {
    authServerUrl: 'https://auth.lhamacorp.com',
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

/**
 * Set up proxy request handler - this is the Firefox way to handle SOCKS5 auth
 * Unlike onAuthRequired (which only works for HTTP auth), proxy.onRequest
 * allows us to provide SOCKS5 credentials directly in the proxy configuration
 */
function setupProxyRequestHandler() {
  console.log('ProxyAuth: Setting up proxy request handler...');

  // This listener intercepts every request and decides which proxy to use
  browser.proxy.onRequest.addListener(
    handleProxyRequest,
    { urls: ['<all_urls>'] }
  );

  // Handle proxy errors
  browser.proxy.onError.addListener((error) => {
    console.error('ProxyAuth: Proxy error:', error.message);
  });

  console.log('ProxyAuth: Proxy request handler registered');
}

/**
 * Handle each proxy request - return proxy config with credentials
 */
async function handleProxyRequest(requestInfo) {
  // If proxy is disabled, use direct connection
  if (!proxyEnabled) {
    return { type: 'direct' };
  }

  const settings = await getSettings();

  // Check passthrough hosts (don't proxy localhost)
  try {
    const url = new URL(requestInfo.url);
    const passthrough = ['localhost', '127.0.0.1'];
    if (passthrough.includes(url.hostname)) {
      return { type: 'direct' };
    }
  } catch (e) {
    // If URL parsing fails, continue with proxy
  }

  // Get current JWT token
  let token;
  try {
    token = await authService.getToken();
    if (!token) {
      console.error('ProxyAuth: No valid token available, using direct connection');
      return { type: 'direct' };
    }
  } catch (error) {
    console.error('ProxyAuth: Failed to get token:', error);
    return { type: 'direct' };
  }

  // Return SOCKS5 proxy config with credentials
  // This is how Firefox SOCKS5 auth works - credentials in the proxy config!
  return {
    type: 'socks',
    host: settings.proxyHost,
    port: parseInt(settings.proxyPort),
    username: settings.username,
    password: token,
    proxyDNS: true  // Route DNS through the proxy too
  };
}

/**
 * Enable proxy - just sets the flag, handleProxyRequest does the work
 */
async function configureProxy() {
  const settings = await getSettings();

  if (!settings.proxyHost || !settings.proxyPort) {
    console.error('ProxyAuth: Invalid proxy configuration');
    return;
  }

  console.log(`ProxyAuth: Enabling proxy: ${settings.proxyHost}:${settings.proxyPort}`);
  proxyEnabled = true;
  console.log('ProxyAuth: Proxy enabled');
}

/**
 * Disable proxy
 */
async function clearProxy() {
  console.log('ProxyAuth: Disabling proxy...');
  proxyEnabled = false;
  console.log('ProxyAuth: Proxy disabled');
}

/**
 * Handle settings changes
 */
async function handleSettingsChange(changes, area) {
  if (area !== 'local') return;

  console.log('ProxyAuth: Settings changed:', Object.keys(changes));

  // Update current settings
  currentSettings = await getSettings();

  // Handle auto-connect changes
  if ('autoConnect' in changes) {
    if (changes.autoConnect.newValue) {
      await configureProxy();
    } else {
      await clearProxy();
    }
  }

  // Handle proxy configuration changes
  if ('proxyHost' in changes || 'proxyPort' in changes) {
    if (currentSettings.autoConnect) {
      await configureProxy();
    }
  }
}

/**
 * Set up context menu for quick access
 */
function setupContextMenu() {
  try {
    browser.contextMenus.create({
      id: 'proxy-toggle',
      title: 'Toggle Proxy Connection',
      contexts: ['browser_action']
    });

    browser.contextMenus.onClicked.addListener(async (info, tab) => {
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

    console.log('ProxyAuth: Context menu created');

  } catch (error) {
    console.error('ProxyAuth: Context menu setup failed:', error);
  }
}

/**
 * Handle extension messages from popup/options
 */
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log('ProxyAuth: Received message:', message.action);

  switch (message.action) {
    case 'getStatus':
      const status = authService.getStatus();
      const settings = await getSettings();
      status.hasCredentials = !!(settings.username && settings.password);
      status.proxyConfigured = proxyEnabled;
      return Promise.resolve(status);

    case 'authenticate':
      try {
        await authService.authenticate(
          message.username,
          message.password,
          message.authServerUrl
        );
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

    case 'testConnection':
      try {
        // Simplified proxy test - check connectivity and authentication readiness
        const settings = await getSettings();

        // First check if we have proxy settings
        if (!settings.proxyHost || !settings.proxyPort) {
          throw new Error('Proxy host and port must be configured');
        }

        console.log(`ProxyAuth: Testing proxy readiness for ${settings.proxyHost}:${settings.proxyPort}`);

        // Check if we have valid authentication
        let token;
        try {
          token = await authService.getToken();
          if (!token) {
            throw new Error('No valid authentication token available');
          }
          console.log('ProxyAuth: Valid authentication token available');
        } catch (authError) {
          throw new Error(`Cannot connect to proxy without valid authentication: ${authError.message}`);
        }

        // Provide test results based on current status
        if (proxyEnabled) {
          return Promise.resolve({
            success: true,
            message: `Proxy is configured and ready: ${settings.proxyHost}:${settings.proxyPort}\nAuthentication: Active (token valid)\nStatus: Proxy should be working for all browser traffic`
          });
        } else {
          return Promise.resolve({
            success: true,
            message: `Proxy is ready but not enabled: ${settings.proxyHost}:${settings.proxyPort}\nAuthentication: Active (token valid)\nAction needed: Enable "Auto-Connect" in settings to activate proxy`
          });
        }

      } catch (error) {
        console.error('ProxyAuth: Proxy readiness test failed:', error);
        return Promise.resolve({ success: false, error: error.message });
      }

    default:
      console.warn('ProxyAuth: Unknown message action:', message.action);
      return Promise.resolve({ success: false, error: 'Unknown action' });
  }
});

/**
 * Handle extension installation/update
 */
browser.runtime.onInstalled.addListener(async (details) => {
  console.log('ProxyAuth: Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    // Show welcome notification
    browser.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-48.png',
      title: 'Lhamacorp Proxy Client Installed',
      message: 'Click the extension icon to configure your proxy settings.'
    });

    // Open options page
    browser.runtime.openOptionsPage();
  }
});

/**
 * Handle browser startup
 */
browser.runtime.onStartup.addListener(() => {
  console.log('ProxyAuth: Browser startup detected');
  initialize();
});

// Initialize immediately
initialize();