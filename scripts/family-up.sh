#!/bin/sh
set -eu

if ! docker info >/dev/null 2>&1; then
	printf 'Docker Desktop is not running. Open Docker Desktop and run this command again.\n' >&2
	exit 1
fi

docker compose up --build -d
printf '\nFamily game is starting. The public URL will appear below.\n\n'
docker compose logs -f tunnel