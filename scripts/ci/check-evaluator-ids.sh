#!/usr/bin/env bash
# Fails when an evaluator in .honeyhive/evaluators has no ID in .honeyhive/state.json. An evaluator created in CI gets
# an ID that run cannot commit, so every later run would create it again. Create new evaluators locally with
# scripts/honeyhive/sync-evaluators.sh and commit state.json before merging. Run from the repository root.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

missing=0
for file in .honeyhive/evaluators/*.yaml; do
  name=$(yq '.name' "$file")
  if ! jq -e --arg n "$name" '.evaluators[$n]' .honeyhive/state.json > /dev/null; then
    ci_error "$name has no ID in .honeyhive/state.json" "$file"
    missing=1
  fi
done
exit "$missing"
