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

# Compose reads the shell environment before .env, and ${VAR:?} rejects a variable that is set but empty, so the
# empty image of a service this deploy leaves alone would hide the image .env already names and fail every Compose
# command, not only that service's. Read both images, then drop them from the environment and let .env name the
# images from here on.
ai_image="${AI_IMAGE:-}"
core_image="${CORE_IMAGE:-}"
unset AI_IMAGE CORE_IMAGE

deploy_service() {
  local service="$1" image="$2"
  [[ -n "$image" ]] || return 0
  set_var "$(tr '[:lower:]' '[:upper:]' <<< "$service")_IMAGE" "$image"
  docker compose pull "$service"
  # --wait fails the deploy when the container does not become healthy.
  docker compose up -d --wait --wait-timeout 180 "$service"
}

# AI first: Core calls AI, so the new Core should not start against an old AI.
deploy_service ai "$ai_image"
deploy_service core "$core_image"

# Every deploy pulls a new tag, so old images keep their tags and only -a removes them. Images the other environment
# or the shared Caddy run are in use and stay. A rollback pulls its image again from GHCR, which keeps the latest
# 10 (staging) or 20 (production) versions.
docker image prune -af
docker compose ps
