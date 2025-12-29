/**
 * Popup script for Lhamacorp Proxy Client
 */

let currentStatus = null;

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup: Initializing...');

  // Set up event listeners
  setupEventListeners();

  // Load initial status
  await refreshStatus();

  // Load saved credentials for quick login
  await loadSavedCredentials();

  console.log('Popup: Initialization complete');
});

/**
 * Set up all event listeners
 */
function setupEventListeners() {
  // Login form
  const loginForm = document.getElementById('login-form');
  loginForm.addEventListener('submit', handleLogin);

  // Control buttons
  document.getElementById('toggle-proxy-btn').addEventListener('click', handleToggleProxy);
  document.getElementById('test-connection-btn').addEventListener('click', handleTestConnection);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Action buttons
  document.getElementById('open-options-btn').addEventListener('click', handleOpenOptions);
  document.getElementById('refresh-status-btn').addEventListener('click', refreshStatus);

  // Message close button
  document.getElementById('message-close').addEventListener('click', hideMessage);

  // Logo click for quick refresh
  document.getElementById('logo').addEventListener('click', refreshStatus);
}

/**
 * Load saved credentials for quick login
 */
async function loadSavedCredentials() {
  try {
    const result = await browser.storage.local.get(['username', 'authServerUrl']);

    if (result.username) {
      document.getElementById('username').value = result.username;
    }

  } catch (error) {
    console.error('Popup: Failed to load saved credentials:', error);
  }
}

/**
 * Refresh status from background script
 */
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

/**
 * Update the status display
 */
function updateStatusDisplay() {
  if (!currentStatus) return;

  // Authentication status
  const authStatus = document.getElementById('auth-status');
  const authIndicator = document.getElementById('auth-indicator');
  const tokenExpiryItem = document.getElementById('token-expiry-item');
  const tokenExpiry = document.getElementById('token-expiry');

  if (currentStatus.isAuthenticated) {
    authStatus.textContent = 'Connected';
    authIndicator.className = 'status-indicator connected';

    if (currentStatus.tokenExpiry) {
      const expiryDate = new Date(currentStatus.tokenExpiry);
      tokenExpiry.textContent = formatRelativeTime(expiryDate);
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

  // Proxy status
  const proxyStatus = document.getElementById('proxy-status');
  const proxyIndicator = document.getElementById('proxy-indicator');

  if (currentStatus.proxyConfigured) {
    proxyStatus.textContent = 'Enabled';
    proxyIndicator.className = 'status-indicator connected';
  } else {
    proxyStatus.textContent = 'Disabled';
    proxyIndicator.className = 'status-indicator disconnected';
  }

  // Show/hide sections based on status
  const loginSection = document.getElementById('login-section');
  const logoutBtn = document.getElementById('logout-btn');

  if (!currentStatus.isAuthenticated && !currentStatus.hasCredentials) {
    loginSection.style.display = 'block';
    logoutBtn.style.display = 'none';
  } else {
    loginSection.style.display = 'none';
    logoutBtn.style.display = currentStatus.isAuthenticated ? 'block' : 'none';
  }

  // Update toggle button text
  const toggleText = document.getElementById('toggle-proxy-text');
  toggleText.textContent = currentStatus.proxyConfigured ? 'Disable Proxy' : 'Enable Proxy';
}

/**
 * Handle login form submission
 */
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
    // Get auth server URL from settings
    const settings = await browser.storage.local.get(['authServerUrl']);
    const authServerUrl = settings.authServerUrl || 'https://auth.lhamacorp.com/api/authenticate';

    // Save credentials
    await browser.storage.local.set({
      username: username,
      password: password
    });

    // Attempt authentication
    const result = await sendMessage({
      action: 'authenticate',
      username: username,
      password: password,
      authServerUrl: authServerUrl
    });

    if (result.success) {
      showMessage('Authentication successful!', 'success');

      // Clear password field
      document.getElementById('password').value = '';

      // Refresh status
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

/**
 * Handle proxy toggle
 */
async function handleToggleProxy() {
  showLoading(true);

  try {
    const result = await sendMessage({ action: 'toggleProxy' });

    if (result.success) {
      const status = result.enabled ? 'enabled' : 'disabled';
      showMessage(`Proxy ${status}`, 'success');
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

/**
 * Handle connection test
 */
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

/**
 * Handle logout
 */
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

/**
 * Handle opening options page
 */
function handleOpenOptions() {
  browser.runtime.openOptionsPage();
  window.close();
}

/**
 * Send message to background script
 */
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

/**
 * Show/hide loading overlay
 */
function showLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  overlay.style.display = show ? 'flex' : 'none';

  // Disable all buttons during loading
  const buttons = document.querySelectorAll('.btn');
  buttons.forEach(button => {
    button.disabled = show;
  });
}

/**
 * Show message to user
 */
function showMessage(text, type = 'info') {
  const container = document.getElementById('message-container');
  const messageText = document.getElementById('message-text');

  messageText.textContent = text;
  container.className = `message ${type}`;
  container.style.display = 'flex';

  // Auto-hide success messages
  if (type === 'success') {
    setTimeout(() => {
      hideMessage();
    }, 3000);
  }
}

/**
 * Hide message
 */
function hideMessage() {
  const container = document.getElementById('message-container');
  container.style.display = 'none';
}

/**
 * Format relative time for token expiry
 */
function formatRelativeTime(date) {
  const now = new Date();
  const diff = date - now;

  if (diff < 0) {
    return 'Expired';
  }

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days !== 1 ? 's' : ''}`;
  } else if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else if (minutes > 0) {
    return `${minutes} min${minutes !== 1 ? 's' : ''}`;
  } else {
    return 'Soon';
  }
}

/**
 * Auto-refresh status every 30 seconds
 */
setInterval(() => {
  if (document.visibilityState === 'visible') {
    refreshStatus();
  }
}, 30000);