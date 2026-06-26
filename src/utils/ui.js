async function sendMessage(message) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout - no response from background script')), 30000)
  );
  return Promise.race([browser.runtime.sendMessage(message), timeout]);
}

function showLoading(show) {
  const loadingOverlay = document.getElementById('loading-overlay');
  if (!loadingOverlay) return;

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
  const messageText = document.getElementById('message-text');

  if (!container || !messageText) return;

  messageText.textContent = text;
  container.className = `message ${type}`;
  container.style.display = '';

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

function setupTheme() {
  window.themeManager.setupToggleButton();
}
