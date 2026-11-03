#!/usr/bin/env bash
# Sets the output runs: the JSON list of scripts/infra/run.sh calls one Infra run makes, in order, each with the
# environment whose secrets it reads. Reads SMARTLEDGER_TRIGGER (review, push or manual), the branch from lib.sh and,
# for manual, INFRA_ENVIRONMENT, INFRA_SCOPE and INFRA_MODE.
#   review   none: a change under review only gets lint, so unmerged code never holds the VPS key
#   push     staging plans then applies staging in scope app; main plans then applies production in scope all
#   manual   the environment, scope and mode chosen
set -euo pipefail
. "$(dirname "$0")/lib.sh"

run() { printf '{"mode":"%s","environment":"%s","scope":"%s","secrets":"infra-%s"}' "$1" "$2" "$3" "$4"; }

case "$SMARTLEDGER_TRIGGER" in
  review) runs='[]' ;;
  push)
    if [ "$SMARTLEDGER_REF" = main ]; then
      runs="[$(run plan production all production-plan),$(run apply production all production)]"
    else
      runs="[$(run plan staging app staging),$(run apply staging app staging)]"
    fi
    ;;
  manual)
    : "${INFRA_ENVIRONMENT:?set by the manual input environment}" "${INFRA_SCOPE:?set by the manual input scope}" \
      "${INFRA_MODE:?set by the manual input mode}"
    secrets="$INFRA_ENVIRONMENT"
    [ "$INFRA_MODE" = apply ] || [ "$INFRA_ENVIRONMENT" = staging ] || secrets=production-plan
    runs="[$(run "$INFRA_MODE" "$INFRA_ENVIRONMENT" "$INFRA_SCOPE" "$secrets")]"
    ;;
  *) ci_error "Unknown trigger '$SMARTLEDGER_TRIGGER'; use review, push or manual."; exit 1 ;;
esac
echo "Runs: $runs"
ci_output runs "$runs"
