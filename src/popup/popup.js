let currentStatus = null;
let availableServers = [];

// Country name to flag emoji mapping for dropdown display
function getCountryFlag(countryName) {
  const flagMap = {
    // Common countries
    'UNITED_STATES': '🇺🇸',
    'CANADA': '🇨🇦',
    'GERMANY': '🇩🇪',
    'FRANCE': '🇫🇷',
    'NETHERLANDS': '🇳🇱',
    'BRAZIL': '🇧🇷',
  };

  return flagMap[countryName] || '🌐';
}

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await refreshStatus();
});

function setupEventListeners() {
  document.getElementById('server-select').addEventListener('change', handleServerSelect);
  document.getElementById('refresh-servers-btn').addEventListener('click', loadAvailableServers);
  document.getElementById('disconnect-btn').addEventListener('click', handleDisconnect);
  document.getElementById('open-options-btn').addEventListener('click', handleOpenOptions);
  document.getElementById('message-close').addEventListener('click', hideMessage);
  document.getElementById('logo').addEventListener('click', refreshStatus);
}


async function refreshStatus() {
  showLoading(true);

  try {
    currentStatus = await sendMessage({ action: 'getStatus' });
    updateStatusDisplay();

    // Validate and sync proxy state to fix inconsistencies
    await validateAndSyncProxyState();

    // Fetch current IP address
    await updateIPStatus();
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
  const serverSection = document.getElementById('server-section');

  if (currentStatus.isAuthenticated) {
    if (serverSection) serverSection.style.display = 'block';
    // Load servers asynchronously with error handling
    loadAvailableServers().catch(error => {
      console.error('Popup: Failed to load servers during status update:', error);
    });
  } else {
    if (serverSection) serverSection.style.display = 'none';
  }

  // CRITICAL: Synchronize disconnect button visibility with actual proxy state
  // The disconnect button should only be visible when proxy is actually connected
  const disconnectBtn = document.getElementById('disconnect-btn');
  const serverSelect = document.getElementById('server-select');
  const refreshServersBtn = document.getElementById('refresh-servers-btn');

  if (disconnectBtn) {
    if (currentStatus.proxyConfigured && currentStatus.isAuthenticated) {
      disconnectBtn.style.display = 'inline-block';

      // Disable server dropdown and refresh button when connected - user must disconnect first
      if (serverSelect) {
        serverSelect.disabled = true;
      }
      if (refreshServersBtn) {
        refreshServersBtn.disabled = true;
      }
      console.log('Popup: Server controls disabled - user is connected (must disconnect to change servers)');
    } else {
      disconnectBtn.style.display = 'none';

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

async function updateIPStatus() {
  const ipStatus = document.getElementById('ip-status');
  const ipIndicator = document.getElementById('ip-indicator');

  if (!ipStatus || !ipIndicator) {
    console.error('Popup: IP status elements not found');
    return;
  }

  try {
    // Set loading state
    ipStatus.textContent = 'Checking...';
    ipIndicator.className = 'status-indicator';

    // Fetch current IP address with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch('https://api.ipify.org?format=text', {
      method: 'GET',
      cache: 'no-cache',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const ipAddress = await response.text();
    const cleanIP = ipAddress.trim();

    // Update display based on proxy status
    ipStatus.textContent = cleanIP;

    if (currentStatus && currentStatus.proxyConfigured) {
      // Connected through proxy
      ipIndicator.className = 'status-indicator connected';
      ipIndicator.title = 'IP through proxy';
    } else {
      // Direct connection (user's real IP)
      ipIndicator.className = 'status-indicator warning';
      ipIndicator.title = 'Your real IP address';
    }
  } catch (error) {
    console.error('Popup: Failed to fetch IP address:', error);

    // Show appropriate error message based on error type
    let errorText = 'Failed to check';
    let errorTitle = 'Could not determine IP address';

    if (error.name === 'AbortError') {
      errorText = 'Check timed out';
      errorTitle = 'IP check took too long - network may be slow';
    } else if (error.message && error.message.includes('network')) {
      errorText = 'Network error';
      errorTitle = 'Could not connect to IP service';
    }

    ipStatus.textContent = errorText;
    ipIndicator.className = 'status-indicator disconnected';
    ipIndicator.title = errorTitle;
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
        console.log('Popup: Cleared server dropdown selection to match proxy state');
      }
    } else if (!hasStoredServer && proxyActuallyConfigured) {
      // Proxy is configured but no stored settings - might be external config
      console.info('Popup: Proxy active without stored server settings (external configuration?)');
    }
  } catch (error) {
    console.error('Popup: Error validating proxy state:', error);
  }
}


async function loadAvailableServers() {
  const serverSelect = document.getElementById('server-select');
  const disconnectBtn = document.getElementById('disconnect-btn');
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
      if (disconnectBtn) disconnectBtn.style.display = 'none';
    } else {
      // Add default "Select" option
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Select a server...';
      serverSelect.appendChild(defaultOption);

      availableServers.forEach((server, index) => {
        const option = document.createElement('option');
        option.value = index;

        // Add flag emoji to country name
        const countryName = server.country || `Server ${index + 1}`;
        const flagEmoji = getCountryFlag(countryName);
        option.textContent = `${flagEmoji} ${countryName}`;

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

    if (disconnectBtn) disconnectBtn.style.display = 'none';

    // Reset available servers on error
    availableServers = [];
    await handleDisconnect();
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
      const flagEmoji = getCountryFlag(server.country);
      showMessage(`Selected server: ${flagEmoji} ${server.country || server.host}`, 'success');
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
    const disconnectBtn = document.getElementById('disconnect-btn');
    if (disconnectBtn) {
      disconnectBtn.style.display = 'none';
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


function handleOpenOptions() {
  browser.runtime.openOptionsPage();
  window.close();
}

async function sendMessage(message) {
  return new Promise((resolve, reject) => {
    // Set up timeout
    const timeout = setTimeout(() => {
      reject(new Error('Request timeout - no response from background script'));
    }, 30000); // 30 second timeout

    browser.runtime.sendMessage(message, (response) => {
      clearTimeout(timeout);

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
