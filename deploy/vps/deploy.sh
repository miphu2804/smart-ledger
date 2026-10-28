#!/usr/bin/env bash
# Runs on the VPS, streamed over SSH by .github/workflows/deploy-backend.yml:
#   ssh vps "APP_DIR=... ENVIRONMENT=... AI_IMAGE=... CORE_IMAGE=... bash -s" < deploy/vps/deploy.sh
# An empty AI_IMAGE or CORE_IMAGE leaves that service as it is. Rolling back is the same call with
# the image of an earlier commit.
set -euo pipefail

: "${APP_DIR:?APP_DIR is required}"
: "${ENVIRONMENT:?ENVIRONMENT is required, staging or production}"
cd "$APP_DIR"

# Replaces one KEY=value line of the Compose project .env, which names the running images and the project.
set_var() {
  local key="$1" value="$2"
  grep -v "^$key=" .env > .env.next || true
  printf '%s=%s\n' "$key" "$value" >> .env.next
  mv .env.next .env
}

# compose.yaml interpolates this into the project name, so it has to be in .env before the first compose call.
# The playbook writes it too; a deploy onto a VPS provisioned before the rename would otherwise fail here.
set_var ENVIRONMENT "$ENVIRONMENT"

# AI first: Core calls AI, so the new Core should not start against an old AI.
for service in ai core; do
  key="$(tr '[:lower:]' '[:upper:]' <<< "$service")_IMAGE"
  image="${!key:-}"
  [[ -n "$image" ]] || continue
  set_var "$key" "$image"
  docker compose pull "$service"
  # --wait fails the deploy when the container does not become healthy.
  docker compose up -d --wait --wait-timeout 180 "$service"
done

# Every deploy pulls a new tag, so old images keep their tags and only -a removes them. Images the other environment
# or the shared Caddy run are in use and stay. A rollback pulls its image again from GHCR, which keeps the latest
# 10 (staging) or 20 (production) versions.
docker image prune -af
docker compose ps
