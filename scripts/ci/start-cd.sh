#!/usr/bin/env bash
# Starts the CD workflow for the areas of a pushed commit whose CI checks passed or were skipped (needs GH_TOKEN).
# Reads CHANGED_AI_IMAGE, CHANGED_CORE, CHANGED_MOBILE and CHANGED_LANDING (true|false, from changes.sh; AI deploys
# only when an input of its image changed, not on every backend/ai change), one *_RESULT of
# each job (AI, CORE, CONTAINERS, MOBILE, LANDING) and RERUN. A re-run (RERUN=true) hands off every area whose checks
# pass, so a changed environment variable can be picked up by re-running all jobs.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

ok() { local r; for r in "$@"; do [ "$r" = success ] || [ "$r" = skipped ] || return 1; done; }
want() { [ "$RERUN" = true ] || [ "$1" = true ]; }
backend_ok=false; ok "$AI_RESULT" "$CORE_RESULT" "$CONTAINERS_RESULT" && backend_ok=true
ai=false; core=false; web=false; landing=false
[ "$backend_ok" = true ] && want "$CHANGED_AI_IMAGE" && ai=true
[ "$backend_ok" = true ] && want "$CHANGED_CORE" && core=true
ok "$MOBILE_RESULT" && want "$CHANGED_MOBILE" && web=true
ok "$LANDING_RESULT" && want "$CHANGED_LANDING" && landing=true
echo "backend-ai=$ai backend-core=$core web=$web landing=$landing"
if [ "$ai$core$web$landing" = falsefalsefalsefalse ]; then
  echo "Nothing to deploy."; exit 0
fi
gh workflow run cd.yml --repo "$SMARTLEDGER_REPOSITORY" --ref "$SMARTLEDGER_REF" -f runner=default \
  -f sha="$SMARTLEDGER_COMMIT" -f ci-run-id="$SMARTLEDGER_RUN_ID" \
  -f backend-ai="$ai" -f backend-core="$core" -f web="$web" -f landing="$landing"
echo "Started CD for ${SMARTLEDGER_COMMIT::7} on $SMARTLEDGER_REF: backend-ai=$ai backend-core=$core web=$web landing=$landing" | ci_summary
