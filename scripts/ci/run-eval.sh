#!/usr/bin/env bash
# Runs the agent_chat eval of backend/ai against the ai.env of write-eval-settings.sh, gates it on thresholds.toml and
# writes report.md under ci_temp_dir. Adds --sync when SYNC=true. Run from backend/ai.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

temp="$(ci_temp_dir)"
sync=""
[ "$SYNC" = true ] && sync="--sync"
# uv only warns about a line it cannot parse and drops the rest of the file, so a warning stops the run.
uv run --env-file "$temp/ai.env" python -c "" 2> "$temp/env-check.log" || true
if grep -qi "failed to parse" "$temp/env-check.log"; then
  ci_error "uv could not parse the ai/staging export; check its quoting"
  exit 1
fi
# shellcheck disable=SC2086 # $sync is one flag or nothing
uv run --env-file "$temp/ai.env" python evaluation/agent_chat/run.py \
  --name "ci-$(git rev-parse --short HEAD)" --repeats 3 \
  --gate evaluation/agent_chat/thresholds.toml --report "$temp/report.md" $sync
