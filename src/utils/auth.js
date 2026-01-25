class AuthService {
  constructor() {
    this.tokenCache = null;
    this.tokenExpiry = null;
    this.refreshTimer = null;
  }

  async init() {
    // Check for stored credentials and handle migration
    const migrationResult = await browser.storage.local.get([
      'authToken', 'tokenExpiry', 'username', 'password', 'refreshMargin'
    ]);

    // Handle migration from credential-based authentication
    if (migrationResult.username && migrationResult.password) {
      console.log('AuthService: Migrating from credential-based authentication');

      // Show migration notification to user
      if (typeof browser.notifications !== 'undefined') {
        browser.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-48.png',
          title: 'Security Update - Lhamacorp Proxy Client',
          message: 'For enhanced security, credentials are no longer stored. Please re-authenticate when needed.'
        });
      }

      // Clean up stored credentials immediately for security
      await browser.storage.local.remove(['username', 'password']);
      console.log('AuthService: Stored credentials removed for security');
    }

    // Migrate refresh margin from old default (300s) to new default (3600s)
    if (migrationResult.refreshMargin === 300 || !migrationResult.refreshMargin) {
      await browser.storage.local.set({ refreshMargin: 3600 });
      console.log('AuthService: Updated refresh margin from 5 minutes to 60 minutes');
    }

    // Initialize token cache if valid token exists
    if (migrationResult.authToken && migrationResult.tokenExpiry) {
      this.tokenCache = migrationResult.authToken;
      this.tokenExpiry = new Date(migrationResult.tokenExpiry);

      if (this.isTokenValid()) {
        this.scheduleTokenRefresh();
      }
    }
  }

  async getSettings() {
    const defaults = {
      authServerUrl: 'https://example.com',
      proxyHost: 'localhost',
      proxyPort: 1080,
      autoConnect: false,
      refreshMargin: 3600
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
      try {
        await this.refreshToken();
      } catch (error) {
        this.tokenCache = null;
        this.tokenExpiry = null;
        await browser.storage.local.remove(['authToken', 'tokenExpiry']);
        return null;
      }
    }
    return this.tokenCache;
  }

  async refreshToken(retryAttempt = 0) {
    if (!this.tokenCache) {
      throw new Error('No token available for refresh');
    }

    const settings = await this.getSettings();

    try {
      const response = await fetch(`${settings.authServerUrl}/api/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.tokenCache}`
        }
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.tokenCache = null;
          this.tokenExpiry = null;
          await browser.storage.local.remove(['authToken', 'tokenExpiry']);
          throw new Error('Token refresh failed - re-authentication required');
        }

        if (response.status >= 500 && retryAttempt === 0) {
          console.log('AuthService: Server error during refresh, retrying in 30 seconds...');
          await new Promise(resolve => setTimeout(resolve, 30000));
          return await this.refreshToken(1);
        }

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

      this.scheduleTokenRefresh();

      console.log('AuthService: Token refreshed successfully');
      return data.token;

    } catch (error) {
      // Network error - retry once after delay
      if (error.name === 'TypeError' && retryAttempt === 0) {
        console.log('AuthService: Network error during refresh, retrying in 30 seconds...');
        await new Promise(resolve => setTimeout(resolve, 30000));
        return await this.refreshToken(1);
      }

      // Log the error for debugging
      console.error('AuthService: Token refresh failed:', error.message);
      throw error;
    }
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
        await this.refreshToken();
      } catch (error) {
        browser.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-48.png',
          title: 'Lhamacorp Proxy Client',
          message: 'Token refresh failed. Please re-authenticate in the options page.'
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
