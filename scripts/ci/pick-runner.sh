#!/usr/bin/env bash
# Sets the outputs runs_on (JSON for `runs-on`) and reason. Reads SMARTLEDGER_RUNNER_CHOICE (auto, github-hosted or
# self-hosted), SMARTLEDGER_RUNNER_LABEL (the label a self-hosted machine must carry), SMARTLEDGER_ALLOW_SELF_HOSTED
# (false keeps the run on the hosted runner whatever the choice) and, for `auto`, RUNNERS_READ_TOKEN.
# Listing runners needs a token with Administration: read; the default workflow token cannot do it, so without
# RUNNERS_READ_TOKEN `auto` always resolves to the hosted runner.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

hosted='["ubuntu-24.04"]'
if [ "$SMARTLEDGER_RUNNER_LABEL" = self-hosted ]; then
  selfhosted='["self-hosted"]'
else
  selfhosted="[\"self-hosted\",\"$SMARTLEDGER_RUNNER_LABEL\"]"
fi
pick() { ci_output runs_on "$1"; ci_output reason "$2"; echo "Runner: $2"; exit 0; }

[ "$SMARTLEDGER_ALLOW_SELF_HOSTED" = true ] || pick "$hosted" "github-hosted: self-hosted is not allowed for this run"
case "$SMARTLEDGER_RUNNER_CHOICE" in
  github-hosted) pick "$hosted" "chosen: github-hosted" ;;
  self-hosted) pick "$selfhosted" "chosen: self-hosted" ;;
  auto) ;;
  *) ci_error "Unknown runner choice '$SMARTLEDGER_RUNNER_CHOICE'; use auto, github-hosted or self-hosted."; exit 1 ;;
esac
[ -n "${RUNNERS_READ_TOKEN:-}" ] || pick "$hosted" "auto: RUNNERS_READ_TOKEN not set, fell back to github-hosted"
if ! free=$(GH_TOKEN="$RUNNERS_READ_TOKEN" gh api "repos/$SMARTLEDGER_REPOSITORY/actions/runners" --paginate \
  --jq ".runners[] | select(.status==\"online\" and .busy==false and any(.labels[]; .name==\"$SMARTLEDGER_RUNNER_LABEL\")) | .name" 2>&1); then
  pick "$hosted" "auto: runner list failed, fell back to github-hosted"
fi
if [ -n "$free" ]; then
  pick "$selfhosted" "auto: self-hosted online ($(echo "$free" | head -1))"
fi
pick "$hosted" "auto: no free self-hosted runner, fell back to github-hosted"
