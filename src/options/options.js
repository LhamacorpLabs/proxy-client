let currentSettings = null;
let currentStatus = null;

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupTheme();
  await loadSettings();
  await refreshStatus();
});

function setupEventListeners() {
  const formElements = [
    'auth-server-url', 'username', 'password', 'refresh-margin'
  ];

  formElements.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('input', markUnsaved);
      element.addEventListener('change', markUnsaved);
    }
  });

  document.getElementById('save-btn').addEventListener('click', handleSave);
  document.getElementById('test-connection-btn').addEventListener('click', handleTestConnection);
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
    const defaults = {
      authServerUrl: 'https://example.com',
      username: '',
      password: '',
      refreshMargin: 300
    };

    const result = await browser.storage.local.get(Object.keys(defaults));
    currentSettings = { ...defaults, ...result };

    populateForm(currentSettings);
  } catch (error) {
    console.error('Options: Failed to load settings:', error);
    showMessage('Failed to load settings', 'error');
  }
}

function populateForm(settings) {
  const textFields = {
    'auth-server-url': settings.authServerUrl,
    'username': settings.username,
    'password': settings.password
  };

  Object.entries(textFields).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value || '';
  });

  const numberFields = {
    'refresh-margin': settings.refreshMargin
  };

  Object.entries(numberFields).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value || '';
  });
}

function getFormValues() {
  return {
    authServerUrl: document.getElementById('auth-server-url').value.trim(),
    username: document.getElementById('username').value.trim(),
    password: document.getElementById('password').value,
    refreshMargin: parseInt(document.getElementById('refresh-margin').value) || 300
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
    const newSettings = getFormValues();

    const validation = validateSettings(newSettings);
    if (!validation.valid) {
      showMessage(`Invalid settings: ${validation.error}`, 'error');
      return;
    }

    await browser.storage.local.set(newSettings);
    currentSettings = newSettings;

    markSaved();
    showMessage('Settings saved successfully!', 'success');

    const hasCredentials = newSettings.username &&
                          newSettings.password &&
                          newSettings.authServerUrl &&
                          !newSettings.authServerUrl.includes('example.com');

    if (hasCredentials) {
      showMessage('Settings saved! Auto-authenticating...', 'info');

      try {
        const result = await sendMessage({
          action: 'authenticate',
          username: newSettings.username,
          password: newSettings.password,
          authServerUrl: newSettings.authServerUrl
        });

        if (result.success) {
          showMessage('Settings saved and authenticated successfully!', 'success');
        } else {
          showMessage(`Settings saved, but authentication failed: ${result.error}`, 'warning');
        }
      } catch (authError) {
        console.error('Options: Auto-authentication failed:', authError);

        let errorMessage = 'Settings saved, but authentication failed';
        if (authError.message && authError.message.includes('timeout')) {
          errorMessage = 'Settings saved, but authentication timed out - check your server URL and try again';
        }

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

  if (settings.refreshMargin < 300 || settings.refreshMargin > 3600) {
    return { valid: false, error: 'Refresh margin must be between 300 and 3600 seconds' };
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
    console.error('Options: Test connection error:', error);
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
    console.error('Options: Clear data error:', error);

    let errorMessage = 'Failed to clear data';
    if (error.message && error.message.includes('network')) {
      errorMessage = 'Network error during data clearing';
    } else if (error.message && error.message.includes('timeout')) {
      errorMessage = 'Operation timed out';
    }

    showMessage(errorMessage, 'error');
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
  } else if (currentStatus.hasCredentials) {
    authStatus.textContent = 'Expired - credentials available';
    authIndicator.className = 'status-indicator warning';
    tokenInfo.style.display = 'none';
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
  loadingOverlay.style.display = show ? 'flex' : 'none';

  if (show) {
    let cancelBtn = loadingOverlay.querySelector('.cancel-btn');
    if (!cancelBtn) {
      cancelBtn = document.createElement('a');
      cancelBtn.className = 'cancel-btn';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.href = '#';
      cancelBtn.style.cssText = 'margin-top: 10px; color: #3498db; text-decoration: underline; cursor: pointer; font-size: 14px;';
      cancelBtn.onclick = (e) => {
        e.preventDefault();
        showLoading(false);
        showMessage('Operation cancelled', 'info');
        location.reload();
      };
      loadingOverlay.appendChild(cancelBtn);
    }
  }

  document.querySelectorAll('.btn').forEach(btn => btn.disabled = show);
}

function showMessage(text, type = 'info') {
  const container = document.getElementById('message-container');
  document.getElementById('message-text').textContent = text;
  container.className = `message ${type}`;
  container.style.display = 'block';

  if (type === 'success') {
    setTimeout(hideMessage, 5000);
  }
}

function hideMessage() {
  document.getElementById('message-container').style.display = 'none';
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

/**
 * Setup theme functionality
 */
function setupTheme() {
  // The theme manager is already initialized in theme.js
  // Just setup the toggle button event listener
  window.themeManager.setupToggleButton();
}
