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
  setupTheme();
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

  if (!authStatus || !authIndicator) return;

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
        if (tokenExpiryItem) tokenExpiryItem.style.display = 'none';
      }
    }
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

  if (!ipStatus || !ipIndicator) return;

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

    if (hasStoredServer && !currentStatus.proxyConfigured) {
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

  if (!serverSelect || isLoadingServers) return;

  try {
    isLoadingServers = true;
    serverSelect.innerHTML = '<option value="">Loading...</option>';
    serverSelect.disabled = true;
    if (refreshServersBtn) refreshServersBtn.disabled = true;

    const result = await sendMessage({ action: 'getServers' });

    if (!result || !result.success) {
      throw new Error(result?.error || 'Unknown error occurred while fetching servers');
    }

    if (!Array.isArray(result.servers)) {
      throw new Error('Invalid server data received');
    }

    availableServers = result.servers.filter(server =>
      server && typeof server === 'object' && server.country && server.host && server.port
    );

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
        const alias = server.host === "localhost" ? "localhost" : server.host.split(".")[0];
        option.textContent = `${flagEmoji} (${alias})`;

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
    if (refreshServersBtn) refreshServersBtn.disabled = isConnected;
  } catch (error) {
    console.error('Popup: Failed to load servers:', error);

    serverSelect.innerHTML = `<option value="">Failed to load servers</option>`;
    isLoadingServers = false;
    const isConnected = currentStatus && currentStatus.proxyConfigured && currentStatus.isAuthenticated;
    serverSelect.disabled = isConnected;
    if (refreshServersBtn) refreshServersBtn.disabled = isConnected;
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
    showMessage('Invalid server selection', 'error');
    return;
  }

  const server = availableServers[serverIndex];

  if (!server.host || !server.port) {
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

    try {
      await sendMessage({ action: 'toggleProxy', enable: true });
    } catch (proxyError) {
      await browser.storage.local.remove(['proxyHost', 'proxyPort']);
      const serverSelect = document.getElementById('server-select');
      if (serverSelect) serverSelect.value = '';
      throw new Error('Failed to enable proxy for selected server');
    }

    await refreshStatus();
    const flagEmoji = getCountryFlag(server.country);
    showMessage(`Selected server: ${flagEmoji} ${server.country || server.host}`, 'success');
  } catch (error) {
    const serverSelect = document.getElementById('server-select');
    if (serverSelect) serverSelect.value = '';
    showMessage('Failed to select server', 'error');
  } finally {
    showLoading(false);
  }
}

async function handleDisconnect() {
  showLoading(true);

  try {
    await browser.storage.local.remove(['proxyHost', 'proxyPort']);
    try {
      await sendMessage({ action: 'toggleProxy', enable: false });
    } catch (proxyError) {
      console.error('Popup: Failed to disable proxy during disconnect:', proxyError);
    }
    const serverSelect = document.getElementById('server-select');
    if (serverSelect) serverSelect.value = '';
    const disconnectBtn = document.getElementById('disconnect-btn');
    if (disconnectBtn) disconnectBtn.style.display = 'none';

    await refreshStatus();
    showMessage('Server disconnected', 'success');
  } catch (error) {
    showMessage('Failed to disconnect server', 'error');
  } finally {
    showLoading(false);
  }
}

function handleOpenOptions() {
  browser.runtime.openOptionsPage();
  window.close();
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
