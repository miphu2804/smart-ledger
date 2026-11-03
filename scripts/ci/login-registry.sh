#!/usr/bin/env bash
# Logs Docker in to the GitHub Container Registry as SMARTLEDGER_ACTOR with REGISTRY_TOKEN, into the DOCKER_CONFIG that
# isolate-deploy-config.sh set.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

: "${DOCKER_CONFIG:?run isolate-deploy-config.sh first}"
mkdir -p "$DOCKER_CONFIG"
# Docker Desktop keeps buildx under ~/.docker/cli-plugins, which the job-local DOCKER_CONFIG hides.
if [ -d "$HOME/.docker/cli-plugins" ]; then
  ln -sfn "$HOME/.docker/cli-plugins" "$DOCKER_CONFIG/cli-plugins"
fi
printf '%s' "$REGISTRY_TOKEN" | docker login ghcr.io --username "$SMARTLEDGER_ACTOR" --password-stdin
