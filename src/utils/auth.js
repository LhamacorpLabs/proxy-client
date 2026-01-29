class AuthService {
  constructor() {
    this.tokenCache = null;
    this.tokenExpiry = null;
    this.refreshInProgress = false;
  }

  async init() {
    // Check for stored credentials and handle migration
    const migrationResult = await browser.storage.local.get([
      'authToken', 'tokenExpiry', 'username', 'password'
    ]);

    if (migrationResult.username && migrationResult.password) {
      console.log('AuthService: Migrating from credential-based authentication');

      if (typeof browser.notifications !== 'undefined') {
        browser.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-48.png',
          title: 'Security Update - Lhamacorp Proxy Client',
          message: 'For enhanced security, credentials are no longer stored. Please re-authenticate when needed.'
        });
      }

      await browser.storage.local.remove(['username', 'password']);
      console.log('AuthService: Stored credentials removed for security');
    }

    if (migrationResult.authToken && migrationResult.tokenExpiry) {
      this.tokenCache = migrationResult.authToken;
      this.tokenExpiry = new Date(migrationResult.tokenExpiry);
    }
  }

  async getSettings() {
    const defaults = {
      authServerUrl: 'https://example.com',
      proxyHost: 'localhost',
      proxyPort: 1080,
      autoConnect: false
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

  needsRefresh() {
    if (!this.tokenCache || !this.tokenExpiry) {
      return false;
    }

    const refreshTime = new Date(this.tokenExpiry.getTime() - (86400 * 1000)); // 24 hours
    return new Date() >= refreshTime;
  }

  async getToken() {
    if (!this.isTokenValid()) {
      this.tokenCache = null;
      this.tokenExpiry = null;
      await browser.storage.local.remove(['authToken', 'tokenExpiry']);
      return null;
    }

    if (this.needsRefresh() && !this.refreshInProgress) {
      try {
        this.refreshInProgress = true;
        await this.refreshToken();
      } catch (error) {
        console.log('AuthService: Token refresh failed, manual authentication required');
        this.tokenCache = null;
        this.tokenExpiry = null;
        await browser.storage.local.remove(['authToken', 'tokenExpiry']);
        return null;
      } finally {
        this.refreshInProgress = false;
      }
    }

    return this.tokenCache;
  }

  async refreshToken() {
    if (!this.tokenCache) {
      throw new Error('No token available for refresh');
    }

    const settings = await this.getSettings();

    const response = await fetch(`${settings.authServerUrl}/api/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.tokenCache}`
      }
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.token) {
      throw new Error('No token received from refresh endpoint');
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

    console.log('AuthService: Token refreshed successfully');
    return data.token;
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


  async logout() {
    this.tokenCache = null;
    this.tokenExpiry = null;

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
