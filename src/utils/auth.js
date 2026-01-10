class AuthService {
  constructor() {
    this.tokenCache = null;
    this.tokenExpiry = null;
    this.refreshTimer = null;
  }

  async init() {
    const result = await browser.storage.local.get(['authToken', 'tokenExpiry']);
    if (result.authToken && result.tokenExpiry) {
      this.tokenCache = result.authToken;
      this.tokenExpiry = new Date(result.tokenExpiry);

      if (this.isTokenValid()) {
        this.scheduleTokenRefresh();
      }
    }
  }

  async getSettings() {
    const defaults = {
      authServerUrl: 'https://example.com',
      username: '',
      password: '',
      proxyHost: 'localhost',
      proxyPort: 1080,
      autoConnect: false,
      refreshMargin: 300
    };

    const result = await browser.storage.local.get(Object.keys(defaults));
    return { ...defaults, ...result };
  }

  async saveSettings(settings) {
    await browser.storage.local.set(settings);
  }

  isTokenValid() {
    if (!this.tokenCache || !this.tokenExpiry) {
      return false;
    }
    return new Date() < this.tokenExpiry;
  }

  async getToken() {
    if (!this.isTokenValid()) {
      await this.reauth();
    }
    return this.tokenCache;
  }

  async reauth() {
    const settings = await this.getSettings();

    if (!settings.username || !settings.password) {
      throw new Error('No stored credentials available for authentication');
    }

    return await this.authenticate(settings.username, settings.password, settings.authServerUrl);
  }

  async authenticate(username, password, authServerUrl) {
    const response = await fetch(`${authServerUrl}/api/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.token) {
      throw new Error('No token received from server');
    }

    let expiryTime;
    if (data.expirationDate) {
      expiryTime = new Date(data.expirationDate);
    } else {
      const tokenPayload = this.parseJWT(data.token);
      expiryTime = new Date(tokenPayload.exp * 1000);
    }

    this.tokenCache = data.token;
    this.tokenExpiry = expiryTime;

    await browser.storage.local.set({
      authToken: data.token,
      tokenExpiry: expiryTime.toISOString()
    });

    this.scheduleTokenRefresh();

    return data.token;
  }

  parseJWT(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c =>
        '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      ).join(''));

      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('AuthService: Error parsing JWT:', error);
      return null;
    }
  }

  async scheduleTokenRefresh() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.tokenExpiry) {
      return;
    }

    const settings = await this.getSettings();
    const refreshTime = new Date(this.tokenExpiry.getTime() - (settings.refreshMargin * 1000));
    const delay = Math.max(0, refreshTime.getTime() - Date.now());

    this.refreshTimer = setTimeout(async () => {
      try {
        await this.reauth();
      } catch (error) {
        browser.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-48.png',
          title: 'Lhamacorp Proxy Client',
          message: 'Authentication expired. Please login again.'
        });
      }
    }, delay);
  }

  async logout() {
    this.tokenCache = null;
    this.tokenExpiry = null;

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    await browser.storage.local.remove(['authToken', 'tokenExpiry']);
  }

  getStatus() {
    return {
      isAuthenticated: this.isTokenValid(),
      tokenExpiry: this.tokenExpiry,
      hasCredentials: false
    };
  }
}

const authService = new AuthService();

if (typeof browser !== 'undefined') {
  authService.init().catch(console.error);
}
