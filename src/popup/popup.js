let currentStatus = null;
let availableServers = [];
let isLoadingServers = false;

function getCountryFlag(countryName) {
  const flagMap = {
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
  document.getElementById('refresh-servers-btn').addEventListener('click', (event) => {
    if (isLoadingServers) {
      event.preventDefault();
      return;
    }
    loadAvailableServers();
  });
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
    await validateAndSyncProxyState();
    await updateIPStatus();
  } catch (error) {
    console.error('Popup: Failed to refresh status:', error);
    showMessage('Failed to get status', 'error');
  } finally {
    showLoading(false);
  }
}

function updateStatusDisplay() {
  const authStatus = document.getElementById('auth-status');
  const authIndicator = document.getElementById('auth-indicator');
  const tokenExpiryItem = document.getElementById('token-expiry-item');
  const tokenExpiry = document.getElementById('token-expiry');

  if (!authStatus || !authIndicator) {
    console.error('Popup: Critical DOM elements missing for status display');
    return;
  }

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

  const serverSection = document.getElementById('server-section');

  if (currentStatus.isAuthenticated) {
    if (serverSection) serverSection.style.display = 'block';
    loadAvailableServers().catch(error => {
      console.error('Popup: Failed to load servers during status update:', error);
    });
  } else {
    if (serverSection) serverSection.style.display = 'none';
  }

  const disconnectBtn = document.getElementById('disconnect-btn');
  const serverSelect = document.getElementById('server-select');
  const refreshServersBtn = document.getElementById('refresh-servers-btn');

  if (disconnectBtn) {
    if (currentStatus.proxyConfigured && currentStatus.isAuthenticated) {
      disconnectBtn.style.display = 'inline-block';
      if (serverSelect) serverSelect.disabled = true;
      if (refreshServersBtn) refreshServersBtn.disabled = true;
    } else {
      disconnectBtn.style.display = 'none';
      if (serverSelect && !isLoadingServers) serverSelect.disabled = false;
      if (refreshServersBtn && !isLoadingServers) refreshServersBtn.disabled = false;

      if (!currentStatus.proxyConfigured && serverSelect && serverSelect.value !== '') {
        serverSelect.value = '';
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
    ipStatus.textContent = 'Checking...';
    ipIndicator.className = 'status-indicator';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

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
    ipStatus.textContent = ipAddress.trim();

    if (currentStatus && currentStatus.proxyConfigured) {
      ipIndicator.className = 'status-indicator connected';
      ipIndicator.title = 'IP through proxy';
    } else {
      ipIndicator.className = 'status-indicator warning';
      ipIndicator.title = 'Your real IP address';
    }
  } catch (error) {
    console.error('Popup: Failed to fetch IP address:', error);

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

async function validateAndSyncProxyState() {
  if (!currentStatus) return;

  try {
    const settings = await browser.storage.local.get(['proxyHost', 'proxyPort']);
    const hasStoredServer = !!(settings.proxyHost && settings.proxyPort);
    const proxyActuallyConfigured = currentStatus.proxyConfigured;

    if (hasStoredServer && !proxyActuallyConfigured) {
      await browser.storage.local.remove(['proxyHost', 'proxyPort']);
      const serverSelect = document.getElementById('server-select');
      if (serverSelect && serverSelect.value !== '') {
        serverSelect.value = '';
      }
    }
  } catch (error) {
    console.error('Popup: Error validating proxy state:', error);
  }
}


async function loadAvailableServers() {
  const serverSelect = document.getElementById('server-select');
  const disconnectBtn = document.getElementById('disconnect-btn');
  const refreshServersBtn = document.getElementById('refresh-servers-btn');

  if (!serverSelect) {
    console.error('Popup: Server select element not found');
    return;
  }

  if (isLoadingServers) return;

  try {
    isLoadingServers = true;
    serverSelect.innerHTML = '<option value="">Loading...</option>';
    serverSelect.disabled = true;

    if (refreshServersBtn) {
      refreshServersBtn.disabled = true;
    }

    const result = await sendMessage({ action: 'getServers' });

    if (!result || !result.success) {
      throw new Error(result?.error || 'Unknown error occurred while fetching servers');
    }

    if (!Array.isArray(result.servers)) {
      throw new Error('Invalid server data received');
    }

    availableServers = result.servers.filter(server => {
      if (!server || typeof server !== 'object') return false;
      if (!server.country || !server.host || !server.port) {
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
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Select a server...';
      serverSelect.appendChild(defaultOption);

      availableServers.forEach((server, index) => {
        const option = document.createElement('option');
        option.value = index;

        const countryName = server.country || `Server ${index + 1}`;
        const flagEmoji = getCountryFlag(countryName);
        option.textContent = `${flagEmoji} ${countryName}`;

        if (currentStatus && currentStatus.proxyConfigured &&
            server.host === currentHost && server.port === parseInt(currentPort)) {
          option.selected = true;
        }

        serverSelect.appendChild(option);
      });
    }

    isLoadingServers = false;
    const isConnected = currentStatus && currentStatus.proxyConfigured && currentStatus.isAuthenticated;
    serverSelect.disabled = isConnected;

    if (refreshServersBtn) {
      refreshServersBtn.disabled = isConnected;
    }
  } catch (error) {
    console.error('Popup: Failed to load servers:', error);

    let errorMessage = 'Failed to load servers';
    if (error.message && error.message.includes('network')) {
      errorMessage = 'Network error - check connection';
    } else if (error.message && error.message.includes('timeout')) {
      errorMessage = 'Request timeout - try again';
    }

    serverSelect.innerHTML = `<option value="">${errorMessage}</option>`;
    isLoadingServers = false;
    const isConnected = currentStatus && currentStatus.proxyConfigured && currentStatus.isAuthenticated;
    serverSelect.disabled = isConnected;

    if (refreshServersBtn) {
      refreshServersBtn.disabled = isConnected;
    }

    if (disconnectBtn) disconnectBtn.style.display = 'none';
    availableServers = [];
    await handleDisconnect();
  } finally {
    isLoadingServers = false;
  }
}

async function handleServerSelect(event) {
  const selectedIndex = event.target.value;

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
    console.error('Popup: Error toggling button states:', error);
  }
}

function showMessage(text, type = 'info') {
  const container = document.getElementById('message-container');
  const messageText = document.getElementById('message-text');

  if (!container || !messageText) {
    console.error('Popup: Message container elements not found');
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
