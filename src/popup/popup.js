let currentStatus = null;
let availableServers = [];

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await refreshStatus();
  await loadSavedCredentials();
});

function setupEventListeners() {
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('toggle-proxy-btn').addEventListener('click', handleToggleProxy);
  document.getElementById('test-connection-btn').addEventListener('click', handleTestConnection);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  document.getElementById('server-select').addEventListener('change', handleServerSelect);
  document.getElementById('refresh-servers-btn').addEventListener('click', loadAvailableServers);
  document.getElementById('open-options-btn').addEventListener('click', handleOpenOptions);
  document.getElementById('refresh-status-btn').addEventListener('click', refreshStatus);
  document.getElementById('message-close').addEventListener('click', hideMessage);
  document.getElementById('logo').addEventListener('click', refreshStatus);
}

async function loadSavedCredentials() {
  try {
    const result = await browser.storage.local.get(['username']);
    if (result.username) {
      document.getElementById('username').value = result.username;
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
  } catch (error) {
    console.error('Popup: Failed to refresh status:', error);
    showMessage('Failed to get status', 'error');
  } finally {
    showLoading(false);
  }
}

function updateStatusDisplay() {
  if (!currentStatus) return;

  const authStatus = document.getElementById('auth-status');
  const authIndicator = document.getElementById('auth-indicator');
  const tokenExpiryItem = document.getElementById('token-expiry-item');
  const tokenExpiry = document.getElementById('token-expiry');

  if (currentStatus.isAuthenticated) {
    authStatus.textContent = 'Connected';
    authIndicator.className = 'status-indicator connected';

    if (currentStatus.tokenExpiry) {
      tokenExpiry.textContent = formatRelativeTime(new Date(currentStatus.tokenExpiry));
      tokenExpiryItem.style.display = 'block';
    }
  } else if (currentStatus.hasCredentials) {
    authStatus.textContent = 'Expired';
    authIndicator.className = 'status-indicator warning';
    tokenExpiryItem.style.display = 'none';
  } else {
    authStatus.textContent = 'Not configured';
    authIndicator.className = 'status-indicator disconnected';
    tokenExpiryItem.style.display = 'none';
  }

  const proxyStatus = document.getElementById('proxy-status');
  const proxyIndicator = document.getElementById('proxy-indicator');

  if (currentStatus.proxyConfigured) {
    proxyStatus.textContent = 'Enabled';
    proxyIndicator.className = 'status-indicator connected';
  } else {
    proxyStatus.textContent = 'Disabled';
    proxyIndicator.className = 'status-indicator disconnected';
  }

  const loginSection = document.getElementById('login-section');
  const serverSection = document.getElementById('server-section');
  const logoutBtn = document.getElementById('logout-btn');

  if (!currentStatus.isAuthenticated && !currentStatus.hasCredentials) {
    loginSection.style.display = 'block';
    serverSection.style.display = 'none';
    logoutBtn.style.display = 'none';
  } else {
    loginSection.style.display = 'none';
    logoutBtn.style.display = currentStatus.isAuthenticated ? 'block' : 'none';

    if (currentStatus.isAuthenticated) {
      serverSection.style.display = 'block';
      loadAvailableServers();
    } else {
      serverSection.style.display = 'none';
    }
  }

  document.getElementById('toggle-proxy-text').textContent =
    currentStatus.proxyConfigured ? 'Disable Proxy' : 'Enable Proxy';
}

async function handleLogin(event) {
  event.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  if (!username || !password) {
    showMessage('Please enter both username and password', 'error');
    return;
  }

  showLoading(true);

  try {
    const settings = await browser.storage.local.get(['authServerUrl']);
    const authServerUrl = settings.authServerUrl || 'https://auth.lhamacorp.com';

    await browser.storage.local.set({ username, password });

    const result = await sendMessage({
      action: 'authenticate',
      username,
      password,
      authServerUrl
    });

    if (result.success) {
      showMessage('Authentication successful!', 'success');
      document.getElementById('password').value = '';
      await refreshStatus();
    } else {
      showMessage(`Authentication failed: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('Popup: Login error:', error);
    showMessage('Login failed. Please try again.', 'error');
  } finally {
    showLoading(false);
  }
}

async function loadAvailableServers() {
  const serverSelect = document.getElementById('server-select');
  const selectedServerInfo = document.getElementById('selected-server-info');
  const selectedServerDisplay = document.getElementById('selected-server-display');

  try {
    serverSelect.innerHTML = '<option value="">Loading...</option>';
    serverSelect.disabled = true;

    const result = await sendMessage({ action: 'getServers' });

    if (!result.success) {
      throw new Error(result.error);
    }

    availableServers = result.servers;

    const settings = await browser.storage.local.get(['proxyHost', 'proxyPort']);
    const currentHost = settings.proxyHost || '';
    const currentPort = settings.proxyPort || '';

    serverSelect.innerHTML = '';

    if (availableServers.length === 0) {
      serverSelect.innerHTML = '<option value="">No servers available</option>';
      selectedServerInfo.style.display = 'none';
    } else {
      availableServers.forEach((server, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${server.host}:${server.port}`;

        if (server.host === currentHost && server.port === parseInt(currentPort)) {
          option.selected = true;
        }

        serverSelect.appendChild(option);
      });

      if (currentHost && currentPort) {
        selectedServerDisplay.textContent = `${currentHost}:${currentPort}`;
        selectedServerInfo.style.display = 'block';
      }
    }

    serverSelect.disabled = false;
  } catch (error) {
    console.error('Popup: Failed to load servers:', error);
    serverSelect.innerHTML = '<option value="">Failed to load</option>';
    serverSelect.disabled = false;
    selectedServerInfo.style.display = 'none';
  }
}

async function handleServerSelect(event) {
  const selectedIndex = event.target.value;

  if (selectedIndex === '' || !availableServers[selectedIndex]) {
    return;
  }

  const server = availableServers[selectedIndex];

  showLoading(true);

  try {
    const result = await sendMessage({
      action: 'selectServer',
      host: server.host,
      port: server.port
    });

    if (result.success) {
      const selectedServerDisplay = document.getElementById('selected-server-display');
      selectedServerDisplay.textContent = `${server.host}:${server.port}`;
      document.getElementById('selected-server-info').style.display = 'block';

      showMessage(`Selected server: ${server.host}:${server.port}`, 'success');
    } else {
      showMessage(`Failed to select server: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('Popup: Server selection error:', error);
    showMessage('Failed to select server', 'error');
  } finally {
    showLoading(false);
  }
}

async function handleToggleProxy() {
  showLoading(true);

  try {
    const result = await sendMessage({ action: 'toggleProxy' });

    if (result.success) {
      showMessage(`Proxy ${result.enabled ? 'enabled' : 'disabled'}`, 'success');
      await refreshStatus();
    } else {
      showMessage(`Failed to toggle proxy: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('Popup: Toggle proxy error:', error);
    showMessage('Failed to toggle proxy', 'error');
  } finally {
    showLoading(false);
  }
}

async function handleTestConnection() {
  showLoading(true);

  try {
    const result = await sendMessage({ action: 'testConnection' });

    if (result.success) {
      showMessage('Connection test successful!', 'success');
    } else {
      showMessage(`Connection test failed: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('Popup: Test connection error:', error);
    showMessage('Connection test failed', 'error');
  } finally {
    showLoading(false);
  }
}

async function handleLogout() {
  if (!confirm('Are you sure you want to logout?')) {
    return;
  }

  showLoading(true);

  try {
    const result = await sendMessage({ action: 'logout' });

    if (result.success) {
      showMessage('Logged out successfully', 'success');
      await refreshStatus();
    } else {
      showMessage(`Logout failed: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('Popup: Logout error:', error);
    showMessage('Logout failed', 'error');
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
  document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
  document.querySelectorAll('.btn').forEach(btn => btn.disabled = show);
}

function showMessage(text, type = 'info') {
  const container = document.getElementById('message-container');
  document.getElementById('message-text').textContent = text;
  container.className = `message ${type}`;
  container.style.display = 'flex';

  if (type === 'success') {
    setTimeout(hideMessage, 3000);
  }
}

function hideMessage() {
  document.getElementById('message-container').style.display = 'none';
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
