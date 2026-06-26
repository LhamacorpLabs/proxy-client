let currentSettings = null;
let currentStatus = null;

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupTheme();
  await loadSettings();
  await refreshStatus();
});

function setupEventListeners() {
  const formElements = ['auth-server-url', 'username', 'password'];

  formElements.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('input', markUnsaved);
      element.addEventListener('change', markUnsaved);
    }
  });

  document.getElementById('save-btn').addEventListener('click', handleSave);
  document.getElementById('test-connection-btn').addEventListener('click', handleTestConnection);
  document.getElementById('disconnect-proxy-btn').addEventListener('click', handleDisconnectProxy);
  document.getElementById('clear-data-btn').addEventListener('click', handleClearData);
  document.getElementById('message-close').addEventListener('click', hideMessage);

  document.getElementById('help-link').addEventListener('click', (e) => {
    e.preventDefault();
    showMessage('Help documentation coming soon!', 'info');
  });

  document.getElementById('privacy-link').addEventListener('click', (e) => {
    e.preventDefault();
    showMessage('This extension stores data locally in your browser only.', 'info');
  });
}

async function loadSettings() {
  try {
    const defaults = { authServerUrl: 'https://example.com' };
    const result = await browser.storage.local.get(Object.keys(defaults));
    currentSettings = { ...defaults, ...result };
    populateForm(currentSettings);
  } catch (error) {
    console.error('Options: Failed to load settings:', error);
    showMessage('Failed to load settings', 'error');
  }
}

function populateForm(settings) {
  const urlField = document.getElementById('auth-server-url');
  if (urlField) urlField.value = settings.authServerUrl || '';

  const usernameField = document.getElementById('username');
  const passwordField = document.getElementById('password');
  if (usernameField) usernameField.value = '';
  if (passwordField) passwordField.value = '';
}

function getFormValues() {
  const authServerUrl = document.getElementById('auth-server-url').value.trim();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  return {
    all: { authServerUrl, username, password },
    credentials: { username, password },
    settings: { authServerUrl }
  };
}

function markUnsaved() {
  const saveBtn = document.getElementById('save-btn');
  if (!saveBtn.classList.contains('unsaved')) {
    saveBtn.classList.add('unsaved');
    saveBtn.textContent = 'Save Settings *';
  }
}

function markSaved() {
  const saveBtn = document.getElementById('save-btn');
  saveBtn.classList.remove('unsaved');
  saveBtn.textContent = 'Save Settings';
}

async function handleSave() {
  showLoading(true);

  try {
    const formData = getFormValues();
    const { settings, credentials, all } = formData;

    const validation = validateSettings(all);
    if (!validation.valid) {
      showMessage(`Invalid settings: ${validation.error}`, 'error');
      return;
    }

    await browser.storage.local.set(settings);
    currentSettings = settings;

    markSaved();
    showMessage('Settings saved successfully!', 'success');

    const hasCredentials = credentials.username &&
                          credentials.password &&
                          settings.authServerUrl &&
                          !settings.authServerUrl.includes('example.com');

    if (hasCredentials) {
      showMessage('Settings saved! Auto-authenticating...', 'info');

      try {
        const result = await sendMessage({
          action: 'authenticate',
          username: credentials.username,
          password: credentials.password,
          authServerUrl: settings.authServerUrl
        });

        if (result.success) {
          showMessage('Settings saved and authenticated successfully! Credentials cleared for security.', 'success');
          document.getElementById('username').value = '';
          document.getElementById('password').value = '';
        } else {
          showMessage(`Settings saved, but authentication failed: ${result.error}`, 'warning');
        }
      } catch (authError) {
        const errorMessage = authError.message && authError.message.includes('timeout')
          ? 'Settings saved, but authentication timed out - check your server URL and try again'
          : 'Settings saved, but authentication failed';
        showMessage(errorMessage, 'warning');
      }
    }

    setTimeout(refreshStatus, 500);
  } catch (error) {
    console.error('Options: Failed to save settings:', error);
    showMessage('Failed to save settings', 'error');
  } finally {
    showLoading(false);
  }
}

function validateSettings(settings) {
  if (!settings.authServerUrl) {
    return { valid: false, error: 'Authentication server URL is required' };
  }

  try {
    new URL(settings.authServerUrl);
  } catch {
    return { valid: false, error: 'Authentication server URL is not valid' };
  }

  return { valid: true };
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
    showMessage('Connection test failed', 'error');
  } finally {
    showLoading(false);
  }
}

async function handleClearData() {
  if (!confirm('This will log you out, disconnect any proxy connection, and clear all extension data including saved passwords and settings. Are you sure?')) {
    return;
  }

  showLoading(true);

  try {
    const isConnected = currentStatus && currentStatus.proxyConfigured;

    if (isConnected) {
      try {
        await browser.storage.local.remove(['proxyHost', 'proxyPort']);
        await sendMessage({ action: 'toggleProxy', enable: false });
      } catch (disconnectError) {
        console.error('Options: Error disconnecting server:', disconnectError);
      }
    }
    await browser.storage.local.clear();
    await loadSettings();
    await sendMessage({ action: 'logout' });

    showMessage(isConnected ? 'Disconnected, logged out, and all data cleared successfully' : 'Logged out and all data cleared successfully', 'success');
    await refreshStatus();
  } catch (error) {
    showMessage('Failed to clear data', 'error');
  } finally {
    showLoading(false);
  }
}

async function handleDisconnectProxy() {
  if (!confirm('This will disconnect any active proxy connections and disable SOCKS proxy. You will need to reconnect manually. Are you sure?')) {
    return;
  }

  showLoading(true);

  try {
    const result = await sendMessage({ action: 'disconnectProxy' });

    if (result.success) {
      showMessage('Proxy disconnected successfully', 'success');
      await refreshStatus();
    } else {
      showMessage(`Failed to disconnect proxy: ${result.error}`, 'error');
    }
  } catch (error) {
    showMessage('Failed to disconnect proxy', 'error');
  } finally {
    showLoading(false);
  }
}

async function refreshStatus() {
  try {
    currentStatus = await sendMessage({ action: 'getStatus' });
    updateStatusDisplay();
  } catch (error) {
    console.error('Options: Failed to refresh status:', error);
  }
}

function updateStatusDisplay() {
  if (!currentStatus) return;

  const authStatus = document.getElementById('auth-status');
  const authIndicator = document.getElementById('auth-indicator');
  const tokenInfo = document.getElementById('token-info');
  const tokenExpiry = document.getElementById('token-expiry');

  if (currentStatus.isAuthenticated) {
    authStatus.textContent = 'Connected';
    authIndicator.className = 'status-indicator connected';

    if (currentStatus.tokenExpiry) {
      tokenExpiry.textContent = new Date(currentStatus.tokenExpiry).toLocaleString();
      tokenInfo.style.display = 'block';
    }
  } else {
    authStatus.textContent = 'Not configured';
    authIndicator.className = 'status-indicator disconnected';
    tokenInfo.style.display = 'none';
  }

  const proxyStatus = document.getElementById('proxy-status');
  const proxyIndicator = document.getElementById('proxy-indicator');
  const proxyDetails = document.getElementById('proxy-details');

  if (currentStatus.proxyConfigured) {
    proxyStatus.textContent = 'Enabled';
    proxyIndicator.className = 'status-indicator connected';
    proxyDetails.textContent = 'Firefox proxy configured';
  } else {
    proxyStatus.textContent = 'Disabled';
    proxyIndicator.className = 'status-indicator disconnected';
    proxyDetails.textContent = 'Firefox proxy not configured';
  }
}

setInterval(() => {
  if (document.visibilityState === 'visible') {
    refreshStatus();
  }
}, 30000);

window.addEventListener('beforeunload', (e) => {
  if (document.getElementById('save-btn').classList.contains('unsaved')) {
    e.preventDefault();
    e.returnValue = '';
  }
});
