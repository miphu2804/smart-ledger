#!/usr/bin/env bash
# Usage: alias-vercel-deployment.sh <deployment URL> <alias, with or without https://>
# Points the fixed staging alias at a deployment and sets the output url to https://<alias>. Reads VERCEL_TOKEN and
# VERCEL_ORG_ID. Calls the REST API directly: `vercel alias set` first loads the token's user, which fails with
# "User not found" for a team token even though deploys succeed.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

deployment="${1:?usage: alias-vercel-deployment.sh <deployment URL> <alias>}"
alias="${2:-}"
alias="${alias#https://}"
[ -n "$alias" ] || { ci_error "the staging alias is not set for this environment"; exit 1; }
api=https://api.vercel.com
auth="Authorization: Bearer $VERCEL_TOKEN"

# curl -f prints nothing of the response, so a rejected alias showed only "curl: (22)". Print the status and Vercel's own
# message, which names the cause (a domain missing from the project, say).
vercel_api() {
  local response status body
  response=$(curl -sS -w '\n%{http_code}' "$@") || return 1
  status=${response##*$'\n'}
  body=${response%$'\n'*}
  if [ "${status#2}" = "$status" ]; then
    ci_error "Vercel API returned $status: $body"
    return 1
  fi
  printf '%s\n' "$body"
}

id=$(vercel_api -H "$auth" "$api/v13/deployments/${deployment#https://}?teamId=$VERCEL_ORG_ID" | jq -r .id)
vercel_api -X POST -H "$auth" -H "Content-Type: application/json" \
  -d "$(jq -n --arg alias "$alias" '{alias: $alias}')" \
  "$api/v2/deployments/$id/aliases?teamId=$VERCEL_ORG_ID"
ci_output url "https://$alias"
echo "alias: https://$alias -> $deployment"
