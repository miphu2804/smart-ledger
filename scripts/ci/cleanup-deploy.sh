#!/usr/bin/env bash
# Stops the job-local ssh-agent, logs Docker out and deletes the SSH and Docker config that isolate-deploy-config.sh
# pointed at, so no key or login outlives the job. Safe to run when a step before it failed.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

if [ -n "${SSH_AGENT_PID:-}" ]; then ssh-agent -k; fi
docker logout ghcr.io || true
# Only the paths isolate-deploy-config.sh set, never the owner's ~/.docker or ~/.ssh.
if [ -n "${SSH_CONFIG:-}" ]; then rm -rf "$(dirname "$SSH_CONFIG")"; fi
if [ -n "${DOCKER_CONFIG:-}" ]; then rm -rf "$DOCKER_CONFIG"; fi
