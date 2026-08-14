# Local Docker And Tunnel Server

This runs the Scopa frontend, multiplayer server, and a temporary Cloudflare
Quick Tunnel through Docker Compose. It is intended for local family testing
and supports the six-player Scopa room flow.

## How It Works

```text
family browser
	|
Cloudflare Quick Tunnel (temporary HTTPS URL)
	|
frontend / Nginx :80 -> host 127.0.0.1:8787
	|
scopa-server :8080 (internal Docker network only)
```

The browser loads the frontend from Nginx and connects to the same origin at
`/ws`. Nginx upgrades that request and forwards it to `scopa-server`, so no
server URL needs to be exposed or configured in the browser.

## Requirements

- Docker Desktop for Apple silicon
- An internet connection

## Start

From the repository root:

```sh
./scripts/family-up.sh
```

The script checks that Docker Desktop is running, builds changed images, starts
all services in the background, and follows the tunnel logs.

Wait for a line like:

```text
https://random-name.trycloudflare.com
```

Send that URL to the family. They can create a room or join one from the
browser without installing anything.

## Stop

```sh
./scripts/family-down.sh
```

The URL is temporary and changes the next time the tunnel starts. Keep the
terminal and Docker Desktop running while the game is active. Quick Tunnels
are intended for development/testing, not production hosting.

## Inspect The Server

Run these commands from the repository root:

```sh
# Service state and published ports
docker compose ps

# Follow all service logs
docker compose logs -f

# Follow only the public URL/tunnel
docker compose logs -f tunnel

# Follow frontend proxy and multiplayer server logs
docker compose logs -f frontend scopa-server

# Check the local frontend
curl -I http://127.0.0.1:8787
```

The tunnel URL can also be found after startup with:

```sh
docker compose logs tunnel 2>&1 | grep -Eo 'https://[^ ]+trycloudflare.com' | tail -1
```

## Modify And Rebuild

Docker does not hot-reload source files. After changing code, restart the
affected service with a rebuild:

```sh
# Frontend changes: React, CSS, assets, or Vite configuration
docker compose up -d --build frontend

# Multiplayer changes: scopa-server source or server package files
docker compose up -d --build scopa-server

# Changes affecting Compose, Nginx, or both services
docker compose up -d --build
```

The tunnel normally does not need rebuilding after application changes. It
automatically reconnects to the frontend container. Recreate it only after
changing its command or image:

```sh
docker compose up -d --force-recreate tunnel
```

## Files To Modify

| File | Purpose | Recreate/rebuild command |
|------|---------|--------------------------|
| `docker-compose.yml` | Services, ports, dependencies, tunnel command | `docker compose up -d --build` |
| `Dockerfile` | Frontend build and Nginx image | `docker compose up -d --build frontend` |
| `scopa-server/Dockerfile` | Multiplayer server build and runtime image | `docker compose up -d --build scopa-server` |
| `docker/nginx.conf` | Static file fallback and `/ws` WebSocket proxy | `docker compose up -d --build frontend` |
| `src/` | Frontend game code | `docker compose up -d --build frontend` |
| `scopa-server/src/` | Multiplayer server code | `docker compose up -d --build scopa-server` |
| `scripts/family-up.sh` | Startup behavior and tunnel log display | Run the script again |

Keep the frontend WebSocket value as `/ws` in the Docker build. Nginx owns that
route and resolves `scopa-server` only inside the Compose network.

## Clean Up Docker Space

Use the project cleanup command after repeated test builds:

```sh
npm run docker:clean
```

It removes unused build cache and stopped containers. It intentionally keeps
Docker volumes, which may contain data for unrelated local services. Do not
use `docker system prune --volumes` unless you have confirmed that every
unused volume can be deleted.

To inspect storage before deleting anything:

```sh
docker system df
docker builder du
```

## Troubleshooting

```sh
docker compose ps
docker compose logs -f frontend scopa-server
```

The browser connects to `/ws` on the same origin as the HTTPS page, so no
random tunnel URL needs to be placed in an environment variable.