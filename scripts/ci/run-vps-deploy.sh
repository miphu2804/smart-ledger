#!/usr/bin/env bash
# Runs deploy/vps/deploy.sh on the VPS over SSH for SMARTLEDGER_ENVIRONMENT. Reads APP_DIR, the SSH_CONFIG of
# start-ssh-agent.sh, and DEPLOY_AI_IMAGE and DEPLOY_CORE_IMAGE: the image to run for each service, empty to leave
# that service as it is.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

ssh -F "$SSH_CONFIG" vps \
  "APP_DIR='$APP_DIR' ENVIRONMENT='$SMARTLEDGER_ENVIRONMENT' AI_IMAGE='$DEPLOY_AI_IMAGE' CORE_IMAGE='$DEPLOY_CORE_IMAGE' bash -s" \
  < "$repo_root/deploy/vps/deploy.sh"
