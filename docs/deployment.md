# Deployment Guide

This guide covers deploying the Scopa app to a VPS with Caddy reverse proxy.

## Prerequisites

- A VPS (e.g., Contabo) with:
  - Node.js 18+ installed
  - Caddy web server installed
  - A domain pointing to your server

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │           Caddy Server              │
                    │                                     │
  HTTPS :443        │   /ws      ──► localhost:3100      │
  ──────────────────►                (WebSocket server)   │
                    │                                     │
                    │   /api/*   ──► localhost:3101      │
                    │                (AI proxy server)    │
                    │                                     │
                    │   /*       ──► /var/www/scopa-ai   │
                    │                (Static files)       │
                    └─────────────────────────────────────┘
```

## Step 1: Create directories on server

SSH into your VPS and run:

```bash
sudo mkdir -p /var/www/scopa-ai
sudo mkdir -p /opt/scopa-server
sudo mkdir -p /opt/scopa-proxy
sudo chown $USER:$USER /var/www/scopa-ai /opt/scopa-server /opt/scopa-proxy
```

## Step 2: Build and upload the frontend

On your local machine:

```bash
# Build with production URLs
VITE_WS_URL=wss://your-domain.com/ws VITE_PROXY_URL=https://your-domain.com npm run build

# Upload (replace YOUR_SERVER_IP)
rsync -avz dist/ user@YOUR_SERVER_IP:/var/www/scopa-ai/
```

## Step 3: Build and upload the WebSocket server

Build locally (TypeScript compiler required), then upload compiled files:

```bash
# Build locally
cd scopa-server
npm install
npm run build

# Upload only what's needed for production
rsync -avz dist/ user@YOUR_SERVER_IP:/opt/scopa-server/dist/
rsync -avz package.json package-lock.json user@YOUR_SERVER_IP:/opt/scopa-server/

# SSH to server and install production dependencies only
ssh user@YOUR_SERVER_IP
cd /opt/scopa-server
npm install --production
```

## Step 4: Build and upload the AI proxy server

Build locally, then upload compiled files:

```bash
# Build locally
cd scopa-proxy
npm install
npm run build

# Upload only what's needed for production
rsync -avz dist/ user@YOUR_SERVER_IP:/opt/scopa-proxy/dist/
rsync -avz package.json package-lock.json user@YOUR_SERVER_IP:/opt/scopa-proxy/

# No production dependencies to install (zero runtime deps)
```

## Step 5: Create systemd services

### WebSocket server

Create `/etc/systemd/system/scopa-server.service`:

```ini
[Unit]
Description=Scopa Multiplayer WebSocket Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/scopa-server
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
Environment=PORT=3100

[Install]
WantedBy=multi-user.target
```

### AI proxy server

Create `/etc/systemd/system/scopa-proxy.service`:

```ini
[Unit]
Description=Scopa AI Proxy Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/scopa-proxy
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
Environment=PORT=3101
Environment=GEMINI_API_KEY=your-gemini-api-key-here
Environment=ALLOWED_ORIGIN=https://your-domain.com

[Install]
WantedBy=multi-user.target
```

Enable and start both services:

```bash
sudo systemctl daemon-reload
sudo systemctl enable scopa-server scopa-proxy
sudo systemctl start scopa-server scopa-proxy
sudo systemctl status scopa-server scopa-proxy
```

## Step 6: Configure Caddy

Add to your `/etc/caddy/Caddyfile`:

```caddyfile
your-domain.com {
    # WebSocket proxy for /ws path
    handle /ws {
        reverse_proxy localhost:3100
    }

    # AI proxy for /api/* paths
    handle /api/* {
        reverse_proxy localhost:3101
    }

    # Static files for the SPA
    handle {
        root * /var/www/scopa-ai
        file_server
        try_files {path} /index.html
    }
}
```

Reload Caddy:

```bash
sudo systemctl reload caddy
```

## Step 7: DNS Setup

Add an A record in your DNS provider:
- **Name**: `@` (or subdomain like `scopa-ai`)
- **Type**: A
- **Value**: Your server IP address

Caddy will automatically provision an SSL certificate from Let's Encrypt.

## Verification

1. Visit `https://your-domain.com` - should load the game
2. Create a multiplayer room - should connect via WebSocket
3. Select "Free AI" opponent and start a game - should play against Gemini
4. Check server logs: `sudo journalctl -u scopa-server -f` / `sudo journalctl -u scopa-proxy -f`

## Updating the App

### Frontend only

```bash
# Local: rebuild and upload
VITE_WS_URL=wss://your-domain.com/ws VITE_PROXY_URL=https://your-domain.com npm run build
rsync -avz dist/ user@YOUR_SERVER_IP:/var/www/scopa-ai/
```

### WebSocket server

```bash
# Build locally
cd scopa-server
npm run build

# Upload and restart
rsync -avz dist/ user@YOUR_SERVER_IP:/opt/scopa-server/dist/
ssh user@YOUR_SERVER_IP "sudo systemctl restart scopa-server"
```

### AI proxy server

```bash
# Build locally
cd scopa-proxy
npm run build

# Upload and restart
rsync -avz dist/ user@YOUR_SERVER_IP:/opt/scopa-proxy/dist/
ssh user@YOUR_SERVER_IP "sudo systemctl restart scopa-proxy"
```

## Troubleshooting

### WebSocket connection fails

1. Check if the server is running:
   ```bash
   sudo systemctl status scopa-server
   ```

2. Check server logs:
   ```bash
   sudo journalctl -u scopa-server -f
   ```

3. Verify Caddy is proxying correctly:
   ```bash
   curl -i https://your-domain.com/ws
   ```

### Static files not loading

1. Check file permissions:
   ```bash
   ls -la /var/www/scopa-ai/
   ```

2. Check Caddy logs:
   ```bash
   sudo journalctl -u caddy -f
   ```

### SSL certificate issues

Caddy handles SSL automatically. If there are issues:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

## Environment Variables

### Frontend (build-time)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_WS_URL` | WebSocket server URL | `wss://your-domain.com/ws` |
| `VITE_PROXY_URL` | AI proxy server URL | `https://your-domain.com` |
| `VITE_UMAMI_SCRIPT_URL` | Umami script URL (optional) | `https://analytics.example.com/script.js` |
| `VITE_UMAMI_WEBSITE_ID` | Umami website ID (optional) | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |

### WebSocket Server (runtime)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | WebSocket server port | `3100` |

### AI Proxy Server (runtime)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | AI proxy server port | `3101` |
| `GEMINI_API_KEY` | Google Gemini API key | (required) |
| `ALLOWED_ORIGIN` | CORS allowed origin | `*` |
