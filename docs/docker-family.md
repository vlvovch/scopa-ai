# Local Family Multiplayer

This runs Scopa on a Mac through Docker and publishes one temporary HTTPS URL
for family members. It supports the six-player Scopa room flow.

## Requirements

- Docker Desktop for Apple silicon
- An internet connection

## Start

From the repository root:

```sh
./scripts/family-up.sh
```

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

## Troubleshooting

```sh
docker compose ps
docker compose logs -f frontend scopa-server
```

The browser connects to `/ws` on the same origin as the HTTPS page, so no
random tunnel URL needs to be placed in an environment variable.