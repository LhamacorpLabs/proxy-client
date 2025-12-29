# Lhamacorp Proxy Client - Firefox Extension

## Context

This Firefox extension was created to solve a specific authentication challenge with a SOCKS5 proxy server that requires JWT token authentication.

## Problem Statement

The Lhamacorp SOCKS5 proxy server (located at `/Users/dkb/Developer/private/proxy-server`) implements JWT authentication through the SOCKS5 username/password authentication method:
- Username: regular username
- Password: JWT token (instead of traditional password)

This creates a challenge for browsers like Firefox because:
1. JWT tokens expire (typically short-lived)
2. Firefox doesn't automatically refresh authentication credentials
3. Users would need to manually update proxy credentials frequently

## Solution

This Firefox extension provides automatic JWT token management for SOCKS5 proxy connections by:

1. **Authentication Service** (`src/utils/auth.js`):
   - Manages JWT token lifecycle
   - Handles automatic token refresh before expiry
   - Securely stores tokens using browser storage API

2. **Background Script** (`src/background/proxy-auth.js`):
   - Intercepts proxy authentication requests
   - Automatically provides current valid JWT token
   - Handles authentication failures gracefully

3. **User Interface**:
   - Popup for quick status and basic controls
   - Options page for detailed configuration
   - Real-time status updates

## Project Structure

```
/
├── manifest.json                 # Extension manifest
├── claude.md                    # This documentation
├── src/
│   ├── background/
│   │   └── proxy-auth.js        # Background script for proxy auth
│   ├── popup/
│   │   ├── popup.html           # Extension popup UI
│   │   ├── popup.js             # Popup logic
│   │   └── popup.css            # Popup styling
│   ├── options/
│   │   ├── options.html         # Options page UI
│   │   ├── options.js           # Options page logic
│   │   └── options.css          # Options styling
│   └── utils/
│       └── auth.js              # Authentication service
└── icons/
    └── (icon files)             # Extension icons
```

## Configuration

The extension requires the following settings:
- **Auth Server URL**: Where to authenticate (default: `http://localhost:8080/auth`)
- **Username/Password**: Credentials for JWT authentication
- **Proxy Host/Port**: SOCKS5 proxy server details (default: `localhost:1080`)
- **Auto-Connect**: Whether to automatically configure Firefox proxy settings
- **Refresh Margin**: How early to refresh tokens before expiry (default: 5 minutes)

## Integration with SOCKS5 Server

The extension integrates with the Java SOCKS5 server's `JwtPasswordAuthHandler` class:
- Server expects JWT token in the password field of SOCKS5 auth
- Extension provides fresh tokens automatically
- Server validates tokens using `AuthClient.current(jwtToken)`

## Development Status

- [x] Project structure created
- [x] Authentication service implemented
- [x] Manifest configuration
- [ ] Background script for proxy authentication
- [ ] Popup UI
- [ ] Options page
- [ ] Icon assets
- [ ] Testing and validation

## Testing

To test this extension:
1. Start the Lhamacorp SOCKS5 server
2. Load the extension in Firefox (about:debugging)
3. Configure authentication settings
4. Set Firefox to use the SOCKS5 proxy
5. Browse the web - authentication should be automatic

## Future Enhancements

- Multiple proxy server support
- Connection health monitoring
- Advanced token caching strategies
- Integration with external credential managers