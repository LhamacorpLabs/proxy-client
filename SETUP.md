# Setup Guide - Lhamacorp Proxy Client

## Prerequisites

Before you can use this Firefox extension, you need to complete a few setup steps.

## Step 1: Create Icon Files

The extension requires PNG icon files that aren't included in the repository. You have two options:

### Option A: Use the provided script (recommended)
```bash
# Install ImageMagick (macOS with Homebrew)
brew install imagemagick

# Run the icon creation script
./create-icons.sh
```

### Option B: Create icons manually
1. Use any image editor to convert `icons/icon.svg` to PNG format
2. Create the following files:
   - `icons/icon-16.png` (16x16 pixels)
   - `icons/icon-32.png` (32x32 pixels)
   - `icons/icon-48.png` (48x48 pixels)
   - `icons/icon-128.png` (128x128 pixels)

### Option C: Use placeholder images (quick testing)
```bash
# Create simple colored square placeholders
cd icons
# Create a simple colored PNG (requires ImageMagick)
magick -size 128x128 xc:"#667eea" icon-128.png
magick icon-128.png -resize 48x48 icon-48.png
magick icon-128.png -resize 32x32 icon-32.png
magick icon-128.png -resize 16x16 icon-16.png
```

## Step 2: Configure Your SOCKS5 Server

Ensure your SOCKS5 server is running and configured for JWT authentication. The server should:

1. Accept SOCKS5 username/password authentication
2. Treat the "password" field as a JWT token
3. Validate tokens using your authentication service

Example server configuration (Java):
```java
// In your SOCKS5 server
private static class JwtPasswordAuthHandler extends SimpleChannelInboundHandler<DefaultSocks5PasswordAuthRequest> {
    @Override
    public void channelRead0(ChannelHandlerContext ctx, DefaultSocks5PasswordAuthRequest request) {
        String username = request.username();
        String jwtToken = request.password(); // JWT token in password field

        // Validate JWT token
        AuthClient.CurrentUser currentUser = authClient.current(jwtToken);
        // ... handle authentication
    }
}
```

## Step 3: Set Up Authentication Server

Your authentication server should provide a JWT authentication endpoint:

```
POST /auth/login
Content-Type: application/json

{
  "username": "your-username",
  "password": "your-password"
}

Response (200 OK):
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "exp": 1640995200  // Unix timestamp of expiry
}
```

## Step 4: Install the Extension

### Development Installation
1. Open Firefox
2. Navigate to `about:debugging`
3. Click "This Firefox"
4. Click "Load Temporary Add-on"
5. Select the `manifest.json` file from this project

### Loading in Firefox Developer Edition
Same process as above, but Firefox Developer Edition provides better debugging tools.

## Step 5: Initial Configuration

1. Click the extension icon in Firefox toolbar
2. Click "Settings" to open options page
3. Configure:
   - **Auth Server URL**: `http://localhost:8080/auth` (or your server URL)
   - **Username/Password**: Your authentication credentials
   - **Proxy Host**: `localhost` (or your SOCKS5 server host)
   - **Proxy Port**: `1080` (or your SOCKS5 server port)
   - **Auto-Connect**: Enable to automatically configure Firefox proxy

4. Click "Save Settings"
5. Click "Test Authentication" to verify connection
6. Enable "Auto-Connect" if you want automatic proxy configuration

## Step 6: Testing

1. With the extension configured and auto-connect enabled
2. Browse to any website
3. Check the extension popup for connection status
4. Verify in your SOCKS5 server logs that connections are authenticated

### Manual Proxy Configuration (Alternative)
If you don't use auto-connect:

1. Go to Firefox Settings → Network Settings
2. Select "Manual proxy configuration"
3. Set SOCKS Host: `localhost`, Port: `1080`
4. Select "SOCKS v5"
5. The extension will handle authentication automatically

## Troubleshooting

### Icons Not Loading
- Ensure all icon files exist in the `icons/` directory
- Check browser console for missing file errors
- Run the icon creation script if needed

### Authentication Failures
- Check auth server URL and credentials in options
- Verify auth server is running and accessible
- Check browser console for error messages
- Enable debug mode in advanced settings

### Proxy Connection Issues
- Verify SOCKS5 server is running
- Check proxy host/port settings
- Ensure firewall allows connections
- Test connection using the extension's test buttons

### Token Refresh Issues
- Check token refresh margin setting (default 5 minutes)
- Verify stored credentials are still valid
- Monitor browser console for refresh errors

## Development Debugging

Enable debug mode in the extension's advanced settings and check:
- Browser console for extension logs
- Network tab for authentication requests
- Extension popup for real-time status

## File Structure Verification

Ensure your project structure looks like this:
```
lhamacorp-proxy-client/
├── manifest.json
├── README.md
├── SETUP.md
├── claude.md
├── create-icons.sh
├── icons/
│   ├── icon.svg
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
└── src/
    ├── background/
    │   └── proxy-auth.js
    ├── popup/
    │   ├── popup.html
    │   ├── popup.js
    │   └── popup.css
    ├── options/
    │   ├── options.html
    │   ├── options.js
    │   └── options.css
    └── utils/
        └── auth.js
```

You're now ready to use the Lhamacorp Proxy Client extension!