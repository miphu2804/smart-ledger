#!/usr/bin/env bash
# Keeps the KEEP_IMAGES latest versions of this environment's packages, newest first by creation, so the running image
# is never the one removed. Reads GH_TOKEN, SMARTLEDGER_REPOSITORY, SMARTLEDGER_ENVIRONMENT and the services to clean
# in SMARTLEDGER_DEPLOY_AI and SMARTLEDGER_DEPLOY_CORE (true|false). A plain REST call with the job's own token, which
# the source label's repository link already authorizes: actions/delete-package-versions@v5 crashes on macOS runners
# (TypeError in macosRelease, actions/delete-package-versions#196) and the self-hosted runner is macOS.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

owner="${SMARTLEDGER_REPOSITORY%%/*}"
repository="${SMARTLEDGER_REPOSITORY#*/}"
services=""
[ "$SMARTLEDGER_DEPLOY_AI" = true ] && services="$services ai"
[ "$SMARTLEDGER_DEPLOY_CORE" = true ] && services="$services core"
for service in $services; do
  package="$repository-$service-$SMARTLEDGER_ENVIRONMENT"
  ids=$(gh api --paginate "users/$owner/packages/container/$package/versions" \
    -q "sort_by(.created_at) | reverse | .[$KEEP_IMAGES:] | .[].id")
  if [ -n "$ids" ]; then
    for id in $ids; do
      gh api -X DELETE "users/$owner/packages/container/$package/versions/$id"
      echo "Deleted $package version $id"
    done
  else
    kept=$(gh api "users/$owner/packages/container/$package/versions" -q 'length')
    echo "$package: $kept version(s), none beyond the keep window"
  fi
done
