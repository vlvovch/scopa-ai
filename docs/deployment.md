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

---

## Deploying Briscola alongside Scopa

Briscola ships from the same repo as a **separate static build** and its
**own multiplayer WebSocket server**, on its own domain
(`briscola-ai.example.com`). It **reuses the existing Scopa AI proxy**
(`scopa-proxy`, one process serves both games) — only its CORS origin
list needs widening.

### Port map (internal, behind Caddy)

| Process | Port | Notes |
|---------|------|-------|
| `scopa-server` (Scopa WS) | `3100` | existing |
| `scopa-proxy` (AI proxy) | `3101` | existing — **shared by both games** |
| `briscola-server` (Briscola WS) | `3102` | new |

### Step B1: Directories

```bash
sudo mkdir -p /var/www/briscola-ai /opt/briscola-server
sudo chown $USER:$USER /var/www/briscola-ai /opt/briscola-server
```

### Step B2: Build & upload the Briscola frontend

The Briscola build is a different Vite mode and a different WS env var
(`VITE_BRISCOLA_WS_URL`, not `VITE_WS_URL`). The proxy URL points at the
Briscola domain — same-origin, so the request carries that Origin; the
proxy must allow it (Step B4).

```bash
VITE_BRISCOLA_WS_URL=wss://briscola-ai.example.com/ws \
VITE_PROXY_URL=https://briscola-ai.example.com \
  npm run build:briscola

rsync -avz dist-briscola/ user@YOUR_SERVER_IP:/var/www/briscola-ai/
```

### Step B3: Build & upload the Briscola WS server

```bash
cd briscola-server
npm install
npm run build

rsync -avz dist/ user@YOUR_SERVER_IP:/opt/briscola-server/dist/
rsync -avz package.json package-lock.json user@YOUR_SERVER_IP:/opt/briscola-server/

ssh user@YOUR_SERVER_IP "cd /opt/briscola-server && npm install --production"
```

`/etc/systemd/system/briscola-server.service`:

```ini
[Unit]
Description=Briscola Multiplayer WebSocket Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/briscola-server
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
Environment=PORT=3102

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable briscola-server
sudo systemctl start briscola-server
sudo systemctl status briscola-server
```

### Step B4: Let the shared proxy accept the Briscola origin

`scopa-proxy` now takes a **comma-separated** `ALLOWED_ORIGIN` list.
Edit `/etc/systemd/system/scopa-proxy.service`:

```ini
Environment=ALLOWED_ORIGIN=https://scopa-ai.example.com,https://briscola-ai.example.com
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart scopa-proxy
```

(If you keep `ALLOWED_ORIGIN=*` you can skip this step, but the explicit
list is the locked-down option and is what makes one proxy safely serve
two origins.)

### Step B5: Caddy site for the Briscola domain

Add a second site block to `/etc/caddy/Caddyfile` (the Scopa block is
unchanged). Note `/ws` → `:3102` (Briscola's own server) but `/api/*`
→ `:3101` (the **shared** proxy):

```caddyfile
briscola-ai.example.com {
    handle /ws {
        reverse_proxy localhost:3102
    }
    handle /api/* {
        reverse_proxy localhost:3101
    }
    handle {
        root * /var/www/briscola-ai
        file_server
        try_files {path} /index.html
    }
}
```

```bash
sudo systemctl reload caddy
```

### Step B6: DNS

Add an A record for `briscola-ai` → your server IP. Caddy
auto-provisions the TLS cert on first request.

### Updating Briscola

```bash
# Frontend
VITE_BRISCOLA_WS_URL=wss://briscola-ai.example.com/ws \
VITE_PROXY_URL=https://briscola-ai.example.com \
  npm run build:briscola
rsync -avz dist-briscola/ user@YOUR_SERVER_IP:/var/www/briscola-ai/

# WS server
cd briscola-server && npm run build
rsync -avz dist/ user@YOUR_SERVER_IP:/opt/briscola-server/dist/
ssh user@YOUR_SERVER_IP "sudo systemctl restart briscola-server"
```

### Verify

1. `https://briscola-ai.example.com` loads Briscola.
2. Create a multiplayer room → second browser joins via the
   `BRISCOLA-XXXX` code or the shared `/join/BRISCOLA-XXXX` link.
3. "Gemini Free" opponent plays (shared proxy; rate limit is global
   across both games per the proxy's per-day counter).
4. Logs: `sudo journalctl -u briscola-server -f`.

---

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
| `VITE_WS_URL` | Scopa WebSocket server URL (`npm run build`) | `wss://scopa-ai.example.com/ws` |
| `VITE_BRISCOLA_WS_URL` | Briscola WebSocket server URL (`npm run build:briscola`) | `wss://briscola-ai.example.com/ws` |
| `VITE_PROXY_URL` | AI proxy server URL (per build) | `https://scopa-ai.example.com` |
| `VITE_UMAMI_SCRIPT_URL` | Umami script URL (optional) | `https://analytics.example.com/script.js` |
| `VITE_UMAMI_WEBSITE_ID` | Umami website ID (optional) | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |

Each game is a separate build artifact: `npm run build` → `dist/`
(Scopa, reads `VITE_WS_URL`), `npm run build:briscola` →
`dist-briscola/` (Briscola, reads `VITE_BRISCOLA_WS_URL`).

### WebSocket Servers (runtime)

| Server | Variable | Description | Default |
|--------|----------|-------------|---------|
| `scopa-server` | `PORT` | Scopa WS port | `8080` (use `3100` on the VPS) |
| `briscola-server` | `PORT` | Briscola WS port | `8081` (use `3102` on the VPS) |

### AI Proxy Server (runtime, shared by both games)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | AI proxy server port | `3101` |
| `GEMINI_API_KEY` | Google Gemini API key | (required) |
| `ALLOWED_ORIGIN` | CORS allowed origin(s) — `*`, or a **comma-separated** list (e.g. `https://scopa-ai.example.com,https://briscola-ai.example.com`) | `*` |
