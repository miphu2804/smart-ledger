#!/usr/bin/env bash
# Usage: upload-settings.sh <core|ai>
# Writes the service's variables from Dopbase to the VPS as <APP_DIR>/<service>.env. Dopbase
# (docs/development/secrets-and-env.md) is the one source of the service variables: each deploy writes core.env and ai.env
# from it, so a value changed there reaches the VPS on the next deploy. DOPBASE_TOKEN is the runner token of one Dopbase
# environment (<service>/<SMARTLEDGER_ENVIRONMENT>), so a leaked token reads only that service. The file goes over stdin,
# so no value shows in a process list. Needs DOPBASE_URL, APP_DIR and the SSH_CONFIG of start-ssh-agent.sh.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

service="${1:?usage: upload-settings.sh <core|ai>}"
file="$(ci_temp_dir)/$service.env"
dopbase export "$service/$SMARTLEDGER_ENVIRONMENT" --stdout --format dotenv > "$file"
remote="umask 077 && cat > '$APP_DIR/$service.env'"
if [ "$service" = core ]; then
  # Core refuses to start on any whitespace or wildcard inside an origin, so stop here instead.
  if grep -E '^CORS_ALLOWED_ORIGINS=' "$file" | grep -qE '[[:space:]*]'; then
    ci_error "CORS_ALLOWED_ORIGINS in core/$SMARTLEDGER_ENVIRONMENT must be comma-separated origins without spaces or wildcards"
    exit 1
  fi
  remote="$remote && rm -f '$APP_DIR/github.core.env'"
fi
ssh -F "$SSH_CONFIG" vps "$remote" < "$file"
rm -f "$file"
