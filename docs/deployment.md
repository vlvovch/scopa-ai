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
  HTTPS :443        │   /ws  ──────► localhost:3100      │
  ──────────────────►                (WebSocket server)   │
                    │                                     │
                    │   /*   ──────► /var/www/scopa-ai   │
                    │                (Static files)       │
                    └─────────────────────────────────────┘
```

## Step 1: Create directories on server

SSH into your VPS and run:

```bash
sudo mkdir -p /var/www/scopa-ai
sudo mkdir -p /opt/scopa-server
sudo chown $USER:$USER /var/www/scopa-ai /opt/scopa-server
```

## Step 2: Build and upload the frontend

On your local machine:

```bash
# Build with production WebSocket URL
VITE_WS_URL=wss://your-domain.com/ws npm run build

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

## Step 4: Create systemd service for the WebSocket server

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

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable scopa-server
sudo systemctl start scopa-server
sudo systemctl status scopa-server
```

## Step 5: Configure Caddy

Add to your `/etc/caddy/Caddyfile`:

```caddyfile
your-domain.com {
    # WebSocket proxy for /ws path
    handle /ws {
        reverse_proxy localhost:3100
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

## Step 6: DNS Setup

Add an A record in your DNS provider:
- **Name**: `@` (or subdomain like `scopa-ai`)
- **Type**: A
- **Value**: Your server IP address

Caddy will automatically provision an SSL certificate from Let's Encrypt.

## Verification

1. Visit `https://your-domain.com` - should load the game
2. Create a multiplayer room - should connect via WebSocket
3. Check server logs: `sudo journalctl -u scopa-server -f`

## Updating the App

### Frontend only

```bash
# Local: rebuild and upload
VITE_WS_URL=wss://your-domain.com/ws npm run build
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
| `VITE_UMAMI_SCRIPT_URL` | Umami script URL (optional) | `https://analytics.example.com/script.js` |
| `VITE_UMAMI_WEBSITE_ID` | Umami website ID (optional) | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |

### WebSocket Server (runtime)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | WebSocket server port | `3100` |
