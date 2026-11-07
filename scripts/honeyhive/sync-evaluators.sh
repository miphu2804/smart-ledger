#!/usr/bin/env bash
# Upserts every evaluator under .honeyhive/evaluators/ on the project of
# HH_PROJECT_API_KEY and keeps their IDs in .honeyhive/state.json (commit it).
# Follows https://docs.honeyhive.ai/v2/cli-reference/config-as-code-evaluators-datasets
# Usage, from the repo root: HH_PROJECT_API_KEY=... bash scripts/honeyhive/sync-evaluators.sh
set -euo pipefail

STATE_FILE="${STATE_FILE:-.honeyhive/state.json}"
[ -f "$STATE_FILE" ] || echo '{"evaluators": {}}' > "$STATE_FILE"

for file in .honeyhive/evaluators/*.yaml; do
  name=$(yq '.name' "$file")
  existing_id=$(jq -r --arg n "$name" '.evaluators[$n] // ""' "$STATE_FILE")

  if [ -n "$existing_id" ]; then
    # The CLI reads metric_id from the file body. The .yaml suffix is appended by
    # hand because BSD mktemp on macOS has no --suffix.
    tmp="$(mktemp).yaml"
    yq ". + {\"metric_id\": \"$existing_id\"}" "$file" > "$tmp"
    honeyhive metrics update --filename "$tmp" > /dev/null
    rm -f "$tmp"
    echo "Updated $name ($existing_id)"
  else
    new_id=$(honeyhive metrics create --filename "$file" | jq -r '.metric_id')
    tmp=$(mktemp)
    jq --arg n "$name" --arg id "$new_id" '.evaluators[$n] = $id' "$STATE_FILE" > "$tmp"
    mv "$tmp" "$STATE_FILE"
    echo "Created $name ($new_id)"
  fi
done
