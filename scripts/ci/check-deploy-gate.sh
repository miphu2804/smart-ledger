#!/usr/bin/env bash
# Fails unless SMARTLEDGER_COMMIT is on branch SMARTLEDGER_REF (staging or main) and a CI run of that exact commit has
# passed the checks of every area to deploy. Needs GH_TOKEN, the full history of the branch (origin/<branch>), and
# SMARTLEDGER_DEPLOY_AI, _CORE, _WEB and _LANDING (true|false). SMARTLEDGER_TESTED_RUN_ID names the CI run; empty uses
# the latest push run of CI for the commit.
# The deploy environments still decide who may deploy where (branch policy, production approval); this check makes sure
# only a commit of this branch whose CI checks passed reaches them.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

fail() { ci_error "$1"; exit 1; }

sha="$SMARTLEDGER_COMMIT"
run_id="${SMARTLEDGER_TESTED_RUN_ID:-}"
if [ "$SMARTLEDGER_REF_TYPE" != branch ] || { [ "$SMARTLEDGER_REF" != staging ] && [ "$SMARTLEDGER_REF" != main ]; }; then
  fail "Run CD from branch staging or main, not $SMARTLEDGER_REF."
fi
if ! [[ "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  fail "sha must be a full 40-character commit SHA."
fi
if ! git merge-base --is-ancestor "$sha" "origin/$SMARTLEDGER_REF"; then
  fail "Commit ${sha::7} is not on $SMARTLEDGER_REF."
fi
if [ "$SMARTLEDGER_DEPLOY_AI$SMARTLEDGER_DEPLOY_CORE$SMARTLEDGER_DEPLOY_WEB$SMARTLEDGER_DEPLOY_LANDING" = falsefalsefalsefalse ]; then
  fail "Choose at least one area to deploy."
fi
if [ -z "$run_id" ]; then
  run_id=$(gh run list --repo "$SMARTLEDGER_REPOSITORY" --workflow ci.yml --commit "$sha" --event push --limit 1 \
    --json databaseId --jq '.[0].databaseId // empty')
  [ -n "$run_id" ] || fail "No CI push run for ${sha::7}."
fi
run_sha=$(gh api "repos/$SMARTLEDGER_REPOSITORY/actions/runs/$run_id" --jq .head_sha)
if [ "$run_sha" != "$sha" ]; then
  fail "CI run $run_id tested ${run_sha::7}, not ${sha::7}."
fi
# The latest attempt of each job; a skipped check counts as passed, as for the required checks.
results=$(gh api "repos/$SMARTLEDGER_REPOSITORY/actions/runs/$run_id/jobs" --paginate --jq '.jobs[] | "\(.name)=\(.conclusion)"')
need() {
  local job result
  for job in "$@"; do
    result=$(echo "$results" | awk -F= -v name="$job" '$1 == name { print $2 }' | tail -1)
    case "$result" in
      success | skipped) echo "$job: $result" ;;
      *) fail "CI job $job of run $run_id is '${result:-missing}'; not deploying." ;;
    esac
  done
}
if [ "$SMARTLEDGER_DEPLOY_AI" = true ] || [ "$SMARTLEDGER_DEPLOY_CORE" = true ]; then need ai core container-images; fi
if [ "$SMARTLEDGER_DEPLOY_WEB" = true ]; then need mobile-web; fi
if [ "$SMARTLEDGER_DEPLOY_LANDING" = true ]; then need landing; fi
