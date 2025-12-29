# Lhamacorp Proxy Client - Firefox Extension

> Automatic JWT authentication for Lhamacorp SOCKS5 proxy servers

A Firefox extension that provides seamless JWT token management for SOCKS5 proxy connections, eliminating the need for manual credential updates when tokens expire.

## Features

- **Automatic JWT Token Management**: Handles token lifecycle including refresh before expiry
- **SOCKS5 Proxy Integration**: Seamless integration with SOCKS5 servers using JWT authentication
- **Real-time Server Selection**: Fetch and select from available proxy servers
- **Background Authentication**: Non-intrusive authentication handling
- **Secure Token Storage**: Uses Firefox's secure storage API
- **Connection Testing**: Built-in proxy connection testing
- **Context Menu Controls**: Quick proxy toggle from browser toolbar
- **Status Monitoring**: Real-time authentication and connection status

## Installation

### For Development

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd proxy-client
   ```

2. **Load the extension in Firefox**:
   - Open Firefox and navigate to `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on"
   - Select the `manifest.json` file from the project directory

3. **Configure the extension**:
   - The options page will open automatically on first install
   - Configure your authentication settings and proxy details

### For Production

The extension will be available through the Firefox Add-ons store once published.

## Configuration

### Required Settings

1. **Authentication Server URL**: The endpoint for JWT authentication
   - Default: `https://auth.lhamacorp.com`
   - Format: `https://your-auth-server.com`

2. **Credentials**:
   - Username: Your authentication username
   - Password: Your authentication password

3. **Proxy Configuration**:
   - Proxy Host: SOCKS5 server hostname (default: `localhost`)
   - Proxy Port: SOCKS5 server port (default: `1080`)

### Optional Settings

- **Auto-Connect**: Automatically enable proxy on startup
- **Refresh Margin**: Token refresh time buffer in seconds (default: 3600s/1 hour)

### Server Communication

- **Auth Endpoint**: `POST /api/authenticate` - Username/password authentication
- **Server List**: `GET /api/servers` - Fetch available proxy servers (authenticated)
- **Token Format**: Standard JWT with expiration claims

## Development

### Project Structure

```
proxy-client/
├── manifest.json              # Extension manifest
├── README.md                  # This documentation
├── CLAUDE.md                  # Project context documentation
├── src/
│   ├── background/
│   │   └── proxy-auth.js      # Background script for proxy handling
│   ├── popup/
│   │   ├── popup.html         # Extension popup interface
│   │   ├── popup.js           # Popup logic and UI handling
│   │   └── popup.css          # Popup styling
│   ├── options/
│   │   ├── options.html       # Settings page interface
│   │   ├── options.js         # Options page logic
│   │   └── options.css        # Options page styling
│   └── utils/
│       └── auth.js            # Authentication service
└── icons/                     # Extension icons (16px to 128px)
```

## Security Considerations

- **Secure Storage**: JWT tokens stored using Firefox's encrypted storage API
- **HTTPS Only**: Authentication server communication over HTTPS
- **Token Expiry**: Automatic token refresh prevents credential exposure
- **Local Bypass**: Local requests bypass proxy to prevent auth loops

## Permissions Used

The extension requires these permissions:

- `webRequest`, `webRequestBlocking`: Intercept and modify proxy requests
- `proxy`: Configure Firefox proxy settings
- `storage`: Securely store authentication data
- `notifications`: User notifications for auth status
- `contextMenus`: Right-click menu integration
- `<all_urls>`: Proxy all web traffic when enabled