let currentSettings = null;
let currentStatus = null;

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadSettings();
  await refreshStatus();
});

function setupEventListeners() {
  const formElements = [
    'auth-server-url', 'username', 'password', 'refresh-margin',
    'proxy-host', 'proxy-port', 'auto-connect', 'connection-timeout',
    'auto-login', 'show-notifications', 'log-level', 'debug-mode'
  ];

  formElements.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('input', markUnsaved);
      element.addEventListener('change', markUnsaved);
    }
  });

  document.getElementById('save-btn').addEventListener('click', handleSave);
  document.getElementById('test-auth-btn').addEventListener('click', handleTestAuth);
  document.getElementById('test-proxy-btn').addEventListener('click', handleTestProxy);
  document.getElementById('clear-data-btn').addEventListener('click', handleClearData);
  document.getElementById('export-settings-btn').addEventListener('click', handleExportSettings);
  document.getElementById('import-settings-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', handleImportSettings);
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
      authServerUrl: 'https://auth.lhamacorp.com',
      username: '',
      password: '',
      refreshMargin: 3600,
      proxyHost: 'localhost',
      proxyPort: 1080,
      autoConnect: false,
      connectionTimeout: 30,
      autoLogin: false,
      showNotifications: true,
      logLevel: 'info',
      debugMode: false
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
    'password': settings.password,
    'proxy-host': settings.proxyHost,
    'log-level': settings.logLevel
  };

  Object.entries(textFields).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value || '';
  });

  const numberFields = {
    'refresh-margin': settings.refreshMargin,
    'proxy-port': settings.proxyPort,
    'connection-timeout': settings.connectionTimeout
  };

  Object.entries(numberFields).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.value = value || '';
  });

  const checkboxFields = {
    'auto-connect': settings.autoConnect,
    'auto-login': settings.autoLogin,
    'show-notifications': settings.showNotifications,
    'debug-mode': settings.debugMode
  };

  Object.entries(checkboxFields).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.checked = Boolean(value);
  });
}

function getFormValues() {
  return {
    authServerUrl: document.getElementById('auth-server-url').value.trim(),
    username: document.getElementById('username').value.trim(),
    password: document.getElementById('password').value,
    refreshMargin: parseInt(document.getElementById('refresh-margin').value) || 300,
    proxyHost: document.getElementById('proxy-host').value.trim(),
    proxyPort: parseInt(document.getElementById('proxy-port').value) || 1080,
    autoConnect: document.getElementById('auto-connect').checked,
    connectionTimeout: parseInt(document.getElementById('connection-timeout').value) || 30,
    autoLogin: document.getElementById('auto-login').checked,
    showNotifications: document.getElementById('show-notifications').checked,
    logLevel: document.getElementById('log-level').value,
    debugMode: document.getElementById('debug-mode').checked
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

  if (!settings.proxyHost) {
    return { valid: false, error: 'Proxy host is required' };
  }

  if (settings.proxyPort < 1 || settings.proxyPort > 65535) {
    return { valid: false, error: 'Proxy port must be between 1 and 65535' };
  }

  if (settings.refreshMargin < 60 || settings.refreshMargin > 3600) {
    return { valid: false, error: 'Refresh margin must be between 60 and 3600 seconds' };
  }

  if (settings.connectionTimeout < 5 || settings.connectionTimeout > 120) {
    return { valid: false, error: 'Connection timeout must be between 5 and 120 seconds' };
  }

  return { valid: true };
}

async function handleTestAuth() {
  showLoading(true);

  try {
    const settings = getFormValues();

    if (!settings.username || !settings.password) {
      showMessage('Please enter username and password', 'error');
      return;
    }

    const result = await sendMessage({
      action: 'authenticate',
      username: settings.username,
      password: settings.password,
      authServerUrl: settings.authServerUrl
    });

    if (result.success) {
      showMessage('Authentication test successful!', 'success');
      await refreshStatus();
    } else {
      showMessage(`Authentication test failed: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('Options: Test auth error:', error);
    showMessage('Authentication test failed', 'error');
  } finally {
    showLoading(false);
  }
}

async function handleTestProxy() {
  showLoading(true);

  try {
    const result = await sendMessage({ action: 'testConnection' });

    if (result.success) {
      showMessage('Proxy connection test successful!', 'success');
    } else {
      showMessage(`Proxy connection test failed: ${result.error}`, 'error');
    }
  } catch (error) {
    console.error('Options: Test proxy error:', error);
    showMessage('Proxy connection test failed', 'error');
  } finally {
    showLoading(false);
  }
}

async function handleClearData() {
  if (!confirm('This will clear all extension data including saved passwords and settings. Are you sure?')) {
    return;
  }

  showLoading(true);

  try {
    await browser.storage.local.clear();
    await loadSettings();
    await sendMessage({ action: 'logout' });

    showMessage('All data cleared successfully', 'success');
    await refreshStatus();
  } catch (error) {
    console.error('Options: Clear data error:', error);
    showMessage('Failed to clear data', 'error');
  } finally {
    showLoading(false);
  }
}

function handleExportSettings() {
  try {
    const exportData = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      settings: { ...currentSettings }
    };

    delete exportData.settings.password;

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `lhamacorp-proxy-settings-${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    showMessage('Settings exported successfully', 'success');
  } catch (error) {
    console.error('Options: Export error:', error);
    showMessage('Failed to export settings', 'error');
  }
}

async function handleImportSettings(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.settings) {
      throw new Error('Invalid settings file format');
    }

    const newSettings = { ...currentSettings, ...data.settings };

    const validation = validateSettings(newSettings);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    populateForm(newSettings);
    markUnsaved();

    showMessage('Settings imported successfully. Click Save to apply.', 'success');
  } catch (error) {
    console.error('Options: Import error:', error);
    showMessage(`Failed to import settings: ${error.message}`, 'error');
  } finally {
    event.target.value = '';
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
    proxyDetails.textContent = `Using ${currentSettings?.proxyHost || 'localhost'}:${currentSettings?.proxyPort || 1080}`;
  } else {
    proxyStatus.textContent = 'Disabled';
    proxyIndicator.className = 'status-indicator disconnected';
    proxyDetails.textContent = 'Firefox proxy not configured';
  }
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
