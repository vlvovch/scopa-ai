#!/bin/sh
set -eu

if ! docker info >/dev/null 2>&1; then
  printf 'Docker Desktop is not running.\n' >&2
  exit 1
fi

printf 'Before cleanup:\n'
docker system df

printf '\nRemoving unused build cache and stopped containers...\n'
docker builder prune -af
docker container prune -f

printf '\nAfter cleanup:\n'
docker system df
printf '\nUnused volumes are intentionally preserved.\n'
