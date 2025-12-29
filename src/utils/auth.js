/**
 * Authentication service for managing JWT tokens
 */
class AuthService {
  constructor() {
    this.tokenCache = null;
    this.tokenExpiry = null;
    this.refreshTimer = null;
  }

  /**
   * Initialize the auth service
   */
  async init() {
    console.log('AuthService: Initializing...');

    // Load cached token
    const result = await browser.storage.local.get(['authToken', 'tokenExpiry']);
    if (result.authToken && result.tokenExpiry) {
      this.tokenCache = result.authToken;
      this.tokenExpiry = new Date(result.tokenExpiry);

      // Set up refresh timer if token is still valid
      if (this.isTokenValid()) {
        this.scheduleTokenRefresh();
      }
    }
  }

  /**
   * Get current settings from storage
   */
  async getSettings() {
    const defaults = {
      authServerUrl: 'https://auth.lhamacorp.com',
      username: '',
      password: '',
      proxyHost: 'localhost',
      proxyPort: 1080,
      autoConnect: false,
      refreshMargin: 3600
    };

    const result = await browser.storage.local.get(Object.keys(defaults));
    return { ...defaults, ...result };
  }

  /**
   * Save settings to storage
   */
  async saveSettings(settings) {
    await browser.storage.local.set(settings);
  }

  /**
   * Check if current token is valid (not expired)
   */
  isTokenValid() {
    if (!this.tokenCache || !this.tokenExpiry) {
      return false;
    }

    return new Date() < this.tokenExpiry;
  }

  /**
   * Get current JWT token, refreshing if necessary
   */
  async getToken() {
    if (this.isTokenValid()) {
      return this.tokenCache;
    }

    // Token expired or doesn't exist, get a new one
    return await this.refreshToken();
  }

  /**
   * Authenticate and get a new JWT token
   */
  async authenticate(username, password, authServerUrl) {
    console.log(`AuthService: Authenticating user "${username}" with ${authServerUrl}/api/authenticate`);

    try {
      const response = await fetch(`${authServerUrl}/api/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          password: password
        })
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('AuthService: Received authentication response:', {
        username: data.username,
        id: data.id,
        expirationDate: data.expirationDate,
        roles: data.roles
      });

      if (!data.token) {
        throw new Error('No token received from server');
      }

      // Use expirationDate from server response if available, otherwise parse JWT
      let expiryTime;
      if (data.expirationDate) {
        expiryTime = new Date(data.expirationDate);
      } else {
        // Fallback to parsing JWT for expiry time
        const tokenPayload = this.parseJWT(data.token);
        expiryTime = new Date(tokenPayload.exp * 1000);
      }

      // Cache the token
      this.tokenCache = data.token;
      this.tokenExpiry = expiryTime;

      // Store in browser storage
      await browser.storage.local.set({
        authToken: data.token,
        tokenExpiry: expiryTime.toISOString()
      });

      // Schedule refresh
      this.scheduleTokenRefresh();

      console.log('AuthService: Authentication successful, token expires at:', expiryTime);
      return data.token;

    } catch (error) {
      console.error('AuthService: Authentication error:', error);
      throw error;
    }
  }

  /**
   * Refresh the current token using stored credentials
   */
  async refreshToken() {
    console.log('AuthService: Refreshing token...');

    const settings = await this.getSettings();

    if (!settings.username || !settings.password) {
      throw new Error('No stored credentials available for token refresh');
    }

    return await this.authenticate(settings.username, settings.password, settings.authServerUrl);
  }

  /**
   * Parse JWT token to extract payload
   */
  parseJWT(token) {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));

      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('AuthService: Error parsing JWT:', error);
      return null;
    }
  }

  /**
   * Schedule automatic token refresh
   */
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

    console.log('AuthService: Scheduling token refresh in', Math.floor(delay / 1000), 'seconds');

    this.refreshTimer = setTimeout(async () => {
      try {
        await this.refreshToken();
      } catch (error) {
        console.error('AuthService: Automatic token refresh failed:', error);
        // Notify user that manual login is required
        browser.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-48.png',
          title: 'Lhamacorp Proxy Client',
          message: 'Authentication expired. Please login again.'
        });
      }
    }, delay);
  }

  /**
   * Clear stored token and credentials
   */
  async logout() {
    console.log('AuthService: Logging out...');

    this.tokenCache = null;
    this.tokenExpiry = null;

    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    await browser.storage.local.remove(['authToken', 'tokenExpiry']);
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isAuthenticated: this.isTokenValid(),
      tokenExpiry: this.tokenExpiry,
      hasCredentials: false // Will be set by calling code based on settings
    };
  }
}

// Create singleton instance
const authService = new AuthService();

// Initialize when background script loads
if (typeof browser !== 'undefined') {
  authService.init().catch(console.error);
}