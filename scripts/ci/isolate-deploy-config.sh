#!/usr/bin/env bash
# Sets DOCKER_CONFIG and SSH_CONFIG to paths under ci_temp_dir for the later steps. On a self-hosted machine the Docker and
# SSH clients would otherwise read and write the owner's ~/.docker and ~/.ssh; these paths keep the owner's logins, keys
# and known hosts untouched. Off CI: eval "$(scripts/ci/isolate-deploy-config.sh)"
set -euo pipefail
. "$(dirname "$0")/lib.sh"

temp="$(ci_temp_dir)"
ci_env DOCKER_CONFIG "$temp/docker"
ci_env SSH_CONFIG "$temp/ssh/config"
