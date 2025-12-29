# Lhamacorp Proxy Client - Firefox Extension

A Firefox extension that automatically handles JWT authentication for SOCKS5 proxy servers, specifically designed for the Lhamacorp proxy server infrastructure.

## Overview

This extension solves the challenge of using JWT tokens for SOCKS5 proxy authentication in Firefox. Since JWT tokens are typically short-lived, manually updating proxy credentials would be impractical. This extension automates the entire process.

## Features

- **Automatic JWT Authentication**: Seamlessly handles JWT token lifecycle
- **Background Token Refresh**: Automatically refreshes tokens before expiry
- **User-Friendly Interface**: Simple popup and comprehensive settings page
- **Firefox Proxy Integration**: Optionally configures Firefox proxy settings
- **Security**: Secure storage of credentials using Firefox's storage API
- **Real-time Status**: Live connection status and token expiry information

## Installation

### Development Installation
1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file from this project

### Production Installation
*Coming soon - will be available through Firefox Add-ons store*

## Configuration

### Initial Setup
1. Click the extension icon in the toolbar
2. Click "Settings" to open the options page
3. Configure the following settings:
   - **Authentication Server URL**: Your auth server endpoint (default: `http://localhost:8080/auth`)
   - **Username/Password**: Your authentication credentials
   - **Proxy Host/Port**: Your SOCKS5 server details (default: `localhost:1080`)
   - **Auto-Connect**: Enable to automatically configure Firefox proxy

### Quick Login
For quick authentication without opening settings:
1. Click the extension icon
2. Enter credentials in the popup
3. Click "Login"

## Usage

Once configured, the extension works automatically:

1. **Authentication**: The extension authenticates with your auth server and caches the JWT token
2. **Proxy Connection**: When you browse the web, Firefox will use your SOCKS5 proxy
3. **Automatic Refresh**: The extension refreshes tokens before they expire
4. **Error Handling**: Shows notifications if authentication fails

## Architecture

```
Background Script
├── Authentication Service (auth.js)
│   ├── Token Management
│   ├── Auto-refresh Logic
│   └── Secure Storage
└── Proxy Auth Handler (proxy-auth.js)
    ├── WebRequest Interception
    ├── Credential Injection
    └── Status Management

User Interface
├── Popup (popup.html/js/css)
│   ├── Quick Status
│   ├── Quick Login
│   └── Basic Controls
└── Options Page (options.html/js/css)
    ├── Detailed Settings
    ├── Advanced Configuration
    └── Status Monitoring
```

## Integration

### With Lhamacorp SOCKS5 Server

The extension integrates with Java SOCKS5 servers that use the following authentication pattern:
- Username: Regular username field
- Password: JWT token (instead of traditional password)

The server's `JwtPasswordAuthHandler` validates the JWT token using `AuthClient.current(jwtToken)`.

### Authentication Flow

1. Extension authenticates with auth server: `POST /auth/login`
2. Server returns JWT token with expiry information
3. Extension stores token and schedules refresh
4. When proxy authentication is required:
   - Extension provides username + JWT token
   - Server validates token and allows connection

## Development

### Project Structure
```
/
├── manifest.json           # Extension manifest
├── README.md              # This file
├── claude.md              # Development context
├── src/
│   ├── background/        # Background scripts
│   ├── popup/             # Popup interface
│   ├── options/           # Options page
│   └── utils/             # Shared utilities
└── icons/                 # Extension icons
```

### Building
No build process required - this is a pure WebExtension that runs directly in Firefox.

### Testing
1. Load the extension in Firefox
2. Configure your SOCKS5 server settings
3. Set up authentication credentials
4. Enable "Auto-Connect" in settings
5. Browse the web - traffic should route through your proxy

## Security

- **Credential Storage**: Uses Firefox's secure storage API
- **Token Transmission**: JWT tokens sent over secure connections
- **Local Processing**: All authentication logic runs locally
- **No External Dependencies**: Self-contained extension

## Troubleshooting

### Common Issues

**Authentication Fails**
- Check auth server URL is correct
- Verify username/password are correct
- Check server logs for authentication errors

**Proxy Connection Issues**
- Verify SOCKS5 server is running
- Check proxy host/port configuration
- Ensure firewall allows connections

**Token Refresh Failures**
- Check if stored credentials are still valid
- Verify auth server is accessible
- Review browser console for error messages

### Debug Mode
Enable debug mode in advanced settings for additional logging in the browser console.

## API Compatibility

### Required Server Endpoints

Your authentication server should provide:

```
POST /auth/login
Content-Type: application/json

{
  "username": "your-username",
  "password": "your-password"
}

Response:
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "expires": "2024-12-29T12:00:00Z"
}
```

## Contributing

This extension was developed specifically for the Lhamacorp proxy infrastructure. For issues or feature requests, please contact the development team.

## License

Internal use only - Lhamacorp infrastructure.