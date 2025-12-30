let currentStatus = null;
let availableServers = [];

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await refreshStatus();
  await loadSavedCredentials();
});

function setupEventListeners() {
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('server-select').addEventListener('change', handleServerSelect);
  document.getElementById('refresh-servers-btn').addEventListener('click', loadAvailableServers);
  document.getElementById('disconnect-btn').addEventListener('click', handleDisconnect);
  document.getElementById('open-options-btn').addEventListener('click', handleOpenOptions);
  document.getElementById('refresh-status-btn').addEventListener('click', refreshStatus);
  document.getElementById('message-close').addEventListener('click', hideMessage);
  document.getElementById('logo').addEventListener('click', refreshStatus);
}

async function loadSavedCredentials() {
  try {
    const usernameInput = document.getElementById('username');
    if (!usernameInput) {
      console.warn('Popup: Username input not found');
      return;
    }

    const result = await browser.storage.local.get(['username']);
    if (result.username) {
      usernameInput.value = result.username;
    }
  } catch (error) {
    console.error('Popup: Failed to load saved credentials:', error);
  }
}

async function refreshStatus() {
  showLoading(true);

  try {
    currentStatus = await sendMessage({ action: 'getStatus' });
    updateStatusDisplay();

    // Validate and sync proxy state to fix inconsistencies
    await validateAndSyncProxyState();
  } catch (error) {
    console.error('Popup: Failed to refresh status:', error);
    showMessage('Failed to get status', 'error');
  } finally {
    showLoading(false);
  }
}

function updateStatusDisplay() {
  // Get DOM elements with safety checks
  const authStatus = document.getElementById('auth-status');
  const authIndicator = document.getElementById('auth-indicator');
  const tokenExpiryItem = document.getElementById('token-expiry-item');
  const tokenExpiry = document.getElementById('token-expiry');

  if (!authStatus || !authIndicator) {
    console.error('Popup: Critical DOM elements missing for status display');
    return;
  }

  // Handle null or incomplete status with fallbacks
  if (!currentStatus) {
    authStatus.textContent = 'Checking...';
    authIndicator.className = 'status-indicator';
    if (tokenExpiryItem) tokenExpiryItem.style.display = 'none';

    const proxyStatus = document.getElementById('proxy-status');
    const proxyIndicator = document.getElementById('proxy-indicator');
    if (proxyStatus) proxyStatus.textContent = 'Unknown';
    if (proxyIndicator) proxyIndicator.className = 'status-indicator';
    return;
  }

  // Authentication status with safety checks
  if (currentStatus.isAuthenticated) {
    authStatus.textContent = 'Connected';
    authIndicator.className = 'status-indicator connected';

    if (currentStatus.tokenExpiry && tokenExpiry && tokenExpiryItem) {
      try {
        tokenExpiry.textContent = formatRelativeTime(new Date(currentStatus.tokenExpiry));
        tokenExpiryItem.style.display = 'block';
      } catch (error) {
        console.error('Popup: Error formatting token expiry:', error);
        if (tokenExpiryItem) tokenExpiryItem.style.display = 'none';
      }
    }
  } else if (currentStatus.hasCredentials) {
    authStatus.textContent = 'Expired';
    authIndicator.className = 'status-indicator warning';
    if (tokenExpiryItem) tokenExpiryItem.style.display = 'none';
  } else {
    authStatus.textContent = 'Not configured';
    authIndicator.className = 'status-indicator disconnected';
    if (tokenExpiryItem) tokenExpiryItem.style.display = 'none';
  }

  // Proxy status with safety checks
  const proxyStatus = document.getElementById('proxy-status');
  const proxyIndicator = document.getElementById('proxy-indicator');

  if (proxyStatus && proxyIndicator) {
    if (currentStatus.proxyConfigured) {
      proxyStatus.textContent = 'Connected';
      proxyIndicator.className = 'status-indicator connected';
    } else {
      proxyStatus.textContent = 'Disconnected';
      proxyIndicator.className = 'status-indicator disconnected';
    }
  }

  // UI section visibility with safety checks
  const loginSection = document.getElementById('login-section');
  const serverSection = document.getElementById('server-section');
  const logoutBtn = document.getElementById('logout-btn');

  if (!currentStatus.isAuthenticated && !currentStatus.hasCredentials) {
    if (loginSection) loginSection.style.display = 'block';
    if (serverSection) serverSection.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
  } else {
    if (loginSection) loginSection.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = currentStatus.isAuthenticated ? 'block' : 'none';

    if (currentStatus.isAuthenticated) {
      if (serverSection) serverSection.style.display = 'block';
      // Load servers asynchronously with error handling
      loadAvailableServers().catch(error => {
        console.error('Popup: Failed to load servers during status update:', error);
      });
    } else {
      if (serverSection) serverSection.style.display = 'none';
    }
  }

  // CRITICAL: Synchronize disconnect button visibility with actual proxy state
  // The disconnect button should only be visible when proxy is actually connected
  const selectedServerInfo = document.getElementById('selected-server-info');
  const serverSelect = document.getElementById('server-select');
  const refreshServersBtn = document.getElementById('refresh-servers-btn');

  if (selectedServerInfo) {
    if (currentStatus.proxyConfigured && currentStatus.isAuthenticated) {
      selectedServerInfo.style.display = 'block';

      // Disable server dropdown and refresh button when connected - user must disconnect first
      if (serverSelect) {
        serverSelect.disabled = true;
      }
      if (refreshServersBtn) {
        refreshServersBtn.disabled = true;
      }
      console.log('Popup: Server controls disabled - user is connected (must disconnect to change servers)');
    } else {
      selectedServerInfo.style.display = 'none';

      // Enable server dropdown and refresh button when disconnected
      if (serverSelect) {
        serverSelect.disabled = false;
      }
      if (refreshServersBtn) {
        refreshServersBtn.disabled = false;
      }

      // If proxy is disconnected but we have stored server settings, clear the dropdown
      // This fixes the inconsistency where dropdown shows selected server but proxy is off
      if (!currentStatus.proxyConfigured) {
        if (serverSelect && serverSelect.value !== '') {
          console.log('Popup: State inconsistency detected - clearing server dropdown selection (proxy disconnected but server selected)');
          serverSelect.value = '';
        }
      }
    }
  }

}

// Helper function to clean up inconsistent state
async function validateAndSyncProxyState() {
  if (!currentStatus) return;

  try {
    const settings = await browser.storage.local.get(['proxyHost', 'proxyPort']);
    const hasStoredServer = !!(settings.proxyHost && settings.proxyPort);
    const proxyActuallyConfigured = currentStatus.proxyConfigured;

    if (hasStoredServer && !proxyActuallyConfigured) {
      // State inconsistency detected: stored server but proxy not active
      console.warn('Popup: State inconsistency detected:', {
        storedServer: `${settings.proxyHost}:${settings.proxyPort}`,
        proxyConfigured: proxyActuallyConfigured,
        action: 'clearing stored settings'
      });

      await browser.storage.local.remove(['proxyHost', 'proxyPort']);

      // Clear dropdown selection
      const serverSelect = document.getElementById('server-select');
      if (serverSelect && serverSelect.value !== '') {
        serverSelect.value = '';
        console.log('Popup: Cleared dropdown selection to match proxy state');
      }
    } else if (!hasStoredServer && proxyActuallyConfigured) {
      // Proxy is configured but no stored settings - might be external config
      console.info('Popup: Proxy active without stored server settings (external configuration?)');
    }
  } catch (error) {
    console.error('Popup: Error validating proxy state:', error);
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');

  if (!usernameInput || !passwordInput) {
    console.error('Popup: Login form elements not found');
    showMessage('Login form is not available', 'error');
    return;
  }

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    showMessage('Please enter both username and password', 'error');
    return;
  }

  showLoading(true);

  try {
    const settings = await browser.storage.local.get(['authServerUrl']);
    const authServerUrl = settings.authServerUrl || 'https://exemple.com';

    await browser.storage.local.set({ username, password });

    const result = await sendMessage({
      action: 'authenticate',
      username,
      password,
      authServerUrl
    });

    if (!result || !result.success) {
      throw new Error(result?.error || 'Authentication failed');
    }

    showMessage('Authentication successful!', 'success');
    passwordInput.value = '';
    await refreshStatus();
  } catch (error) {
    console.error('Popup: Login error:', error);

    let errorMessage = 'Login failed. Please try again.';
    if (error.message && error.message.includes('network')) {
      errorMessage = 'Network error. Check your connection.';
    } else if (error.message && error.message.includes('timeout')) {
      errorMessage = 'Login timed out. Try again.';
    } else if (error.message && (error.message.includes('invalid') || error.message.includes('unauthorized'))) {
      errorMessage = 'Invalid username or password.';
    }

    showMessage(errorMessage, 'error');
  } finally {
    showLoading(false);
  }
}

async function loadAvailableServers() {
  const serverSelect = document.getElementById('server-select');
  const selectedServerInfo = document.getElementById('selected-server-info');
  const refreshServersBtn = document.getElementById('refresh-servers-btn');

  // Safety check for DOM elements
  if (!serverSelect) {
    console.error('Popup: Server select element not found');
    return;
  }

  try {
    serverSelect.innerHTML = '<option value="">Loading...</option>';
    serverSelect.disabled = true;

    // Also disable refresh button during loading
    if (refreshServersBtn) {
      refreshServersBtn.disabled = true;
    }

    const result = await sendMessage({ action: 'getServers' });

    if (!result || !result.success) {
      throw new Error(result?.error || 'Unknown error occurred while fetching servers');
    }

    // Validate server data
    if (!Array.isArray(result.servers)) {
      throw new Error('Invalid server data received');
    }

    availableServers = result.servers.filter(server => {
      // Validate each server has required properties
      if (!server || typeof server !== 'object') return false;
      if (!server.country || !server.host || !server.port) {
        console.warn('Popup: Skipping invalid server:', server);
        return false;
      }
      return true;
    });

    const settings = await browser.storage.local.get(['proxyHost', 'proxyPort']);
    const currentHost = settings.proxyHost || '';
    const currentPort = settings.proxyPort || '';

    serverSelect.innerHTML = '';

    if (availableServers.length === 0) {
      serverSelect.innerHTML = '<option value="">No servers available</option>';
      if (selectedServerInfo) selectedServerInfo.style.display = 'none';
    } else {
      // Add default "Select" option
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Select a server...';
      serverSelect.appendChild(defaultOption);

      availableServers.forEach((server, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = server.country || `Server ${index + 1}`;

        // Only mark as selected if proxy is actually configured AND storage matches
        if (currentStatus && currentStatus.proxyConfigured &&
            server.host === currentHost && server.port === parseInt(currentPort)) {
          option.selected = true;
        }

        serverSelect.appendChild(option);
      });

      // Don't show disconnect button here - let updateStatusDisplay handle it
      // This prevents the inconsistency where button shows but proxy is off
    }

    // Only enable server controls if not connected to a server
    const isConnected = currentStatus && currentStatus.proxyConfigured && currentStatus.isAuthenticated;
    serverSelect.disabled = isConnected;

    if (refreshServersBtn) {
      refreshServersBtn.disabled = isConnected;
    }

    if (isConnected) {
      console.log('Popup: Keeping server controls disabled after loading - user is connected');
    }
  } catch (error) {
    console.error('Popup: Failed to load servers:', error);

    // Provide more helpful error messages
    let errorMessage = 'Failed to load servers';
    if (error.message && error.message.includes('network')) {
      errorMessage = 'Network error - check connection';
    } else if (error.message && error.message.includes('timeout')) {
      errorMessage = 'Request timeout - try again';
    }

    serverSelect.innerHTML = `<option value="">${errorMessage}</option>`;

    // Only enable server controls if not connected to a server
    const isConnected = currentStatus && currentStatus.proxyConfigured && currentStatus.isAuthenticated;
    serverSelect.disabled = isConnected;

    if (refreshServersBtn) {
      refreshServersBtn.disabled = isConnected;
    }

    if (selectedServerInfo) selectedServerInfo.style.display = 'none';

    // Reset available servers on error
    availableServers = [];
  }
}

async function handleServerSelect(event) {
  const selectedIndex = event.target.value;

  // Validate selection
  if (selectedIndex === '' || !availableServers || !Array.isArray(availableServers)) {
    return;
  }

  const serverIndex = parseInt(selectedIndex);
  if (isNaN(serverIndex) || !availableServers[serverIndex]) {
    console.error('Popup: Invalid server selection:', selectedIndex);
    showMessage('Invalid server selection', 'error');
    return;
  }

  const server = availableServers[serverIndex];

  // Validate server data
  if (!server.host || !server.port) {
    console.error('Popup: Server missing required data:', server);
    showMessage('Server configuration is incomplete', 'error');
    return;
  }

  showLoading(true);

  try {
    const result = await sendMessage({
      action: 'selectServer',
      host: server.host,
      port: server.port
    });

    if (!result || !result.success) {
      throw new Error(result?.error || 'Server selection failed');
    }

    // Enable proxy when server is selected
    let proxyEnabled = false;
    try {
      await sendMessage({ action: 'toggleProxy', enable: true });
      proxyEnabled = true;
    } catch (proxyError) {
      console.error('Popup: Failed to enable proxy after server selection:', proxyError);

      // If proxy failed to enable, clear the server selection to maintain consistency
      await browser.storage.local.remove(['proxyHost', 'proxyPort']);

      // Reset dropdown
      const serverSelect = document.getElementById('server-select');
      if (serverSelect) serverSelect.value = '';

      throw new Error('Failed to enable proxy for selected server');
    }

    // Refresh status to update all indicators
    await refreshStatus();

    // Only show success if everything worked
    if (proxyEnabled) {
      showMessage(`Selected server: ${server.country || server.host}`, 'success');
    }
  } catch (error) {
    console.error('Popup: Server selection error:', error);

    // Reset dropdown selection on error
    const serverSelect = document.getElementById('server-select');
    if (serverSelect) serverSelect.value = '';

    let errorMessage = 'Failed to select server';
    if (error.message && error.message.includes('timeout')) {
      errorMessage = 'Server selection timed out';
    } else if (error.message && error.message.includes('network')) {
      errorMessage = 'Network error during server selection';
    }

    showMessage(errorMessage, 'error');
  } finally {
    showLoading(false);
  }
}

async function handleDisconnect() {
  showLoading(true);

  try {
    // Clear the selected server from storage
    await browser.storage.local.remove(['proxyHost', 'proxyPort']);

    // Disable proxy when disconnecting
    try {
      await sendMessage({ action: 'toggleProxy', enable: false });
    } catch (proxyError) {
      console.error('Popup: Failed to disable proxy during disconnect:', proxyError);
      // Continue with disconnect even if proxy toggle fails
    }

    // Reset server dropdown selection
    const serverSelect = document.getElementById('server-select');
    if (serverSelect) {
      serverSelect.value = '';
    }

    // Hide the disconnect button
    const selectedServerInfo = document.getElementById('selected-server-info');
    if (selectedServerInfo) {
      selectedServerInfo.style.display = 'none';
    }

    // Refresh status to update proxy indicators
    await refreshStatus();

    showMessage('Server disconnected', 'success');
  } catch (error) {
    console.error('Popup: Disconnect error:', error);

    let errorMessage = 'Failed to disconnect server';
    if (error.message && error.message.includes('storage')) {
      errorMessage = 'Failed to clear server settings';
    }

    showMessage(errorMessage, 'error');
  } finally {
    showLoading(false);
  }
}


async function handleLogout() {
  // Check if user is connected to a server
  const isConnected = currentStatus && currentStatus.proxyConfigured;
  showLoading(true);

  try {
    // Step 1: Disconnect from server if connected
    if (isConnected) {
      console.log('Popup: Disconnecting server before logout');

      try {
        // Clear server settings from storage
        await browser.storage.local.remove(['proxyHost', 'proxyPort']);

        // Disable proxy
        await sendMessage({ action: 'toggleProxy', enable: false });

        // Clear UI elements
        const serverSelect = document.getElementById('server-select');
        if (serverSelect) serverSelect.value = '';

        const selectedServerInfo = document.getElementById('selected-server-info');
        if (selectedServerInfo) selectedServerInfo.style.display = 'none';

        console.log('Popup: Server disconnected successfully before logout');
      } catch (disconnectError) {
        console.error('Popup: Error disconnecting server during logout:', disconnectError);
        // Continue with logout even if disconnect fails
      }
    }

    // Step 2: Proceed with logout
    const result = await sendMessage({ action: 'logout' });

    if (!result || !result.success) {
      throw new Error(result?.error || 'Logout failed');
    }

    showMessage(isConnected ? 'Disconnected and logged out successfully' : 'Logged out successfully', 'success');
    await refreshStatus();
  } catch (error) {
    console.error('Popup: Logout error:', error);

    let errorMessage = 'Logout failed';
    if (error.message && error.message.includes('network')) {
      errorMessage = 'Network error during logout';
    } else if (error.message && error.message.includes('timeout')) {
      errorMessage = 'Logout timed out';
    }

    showMessage(errorMessage, 'error');
  } finally {
    showLoading(false);
  }
}

function handleOpenOptions() {
  browser.runtime.openOptionsPage();
  window.close();
}

async function sendMessage(message) {
  return new Promise((resolve, reject) => {
    browser.runtime.sendMessage(message, (response) => {
      if (browser.runtime.lastError) {
        reject(browser.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

function showLoading(show) {
  const loadingOverlay = document.getElementById('loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
  }

  // Disable/enable all buttons
  try {
    document.querySelectorAll('.btn').forEach(btn => btn.disabled = show);
  } catch (error) {
    console.warn('Popup: Error toggling button states:', error);
  }
}

function showMessage(text, type = 'info') {
  const container = document.getElementById('message-container');
  const messageText = document.getElementById('message-text');

  if (!container || !messageText) {
    console.error('Popup: Message container elements not found');
    // Fallback to console for critical errors
    console.log(`${type.toUpperCase()}: ${text}`);
    return;
  }

  messageText.textContent = text;
  container.className = `message ${type}`;
  container.style.display = 'flex';

  if (type === 'success') {
    setTimeout(hideMessage, 3000);
  }
}

function hideMessage() {
  const container = document.getElementById('message-container');
  if (container) {
    container.style.display = 'none';
  }
}

function formatRelativeTime(date) {
  const diff = date - new Date();

  if (diff < 0) return 'Expired';

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days !== 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} min${minutes !== 1 ? 's' : ''}`;
  return 'Soon';
}

setInterval(() => {
  if (document.visibilityState === 'visible') {
    refreshStatus();
  }
}, 30000);
