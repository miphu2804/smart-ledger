#!/usr/bin/env bash
# Sets the outputs plan and apply: the scripts/infra/run.sh call of each mode that one Infra run makes, as a JSON object
# with the environment whose secrets it reads, or empty for none; the plan runs first. Sets approval to true when the
# apply targets production. Reads SMARTLEDGER_TRIGGER (review, push or manual), the branch from lib.sh and, for manual,
# INFRA_ENVIRONMENT, INFRA_SCOPE and INFRA_MODE.
#   review   none: a change under review only gets lint, so unmerged code never holds the VPS key
#   push     staging plans then applies staging in scope app; main plans then applies production in scope all
#   manual   the environment, scope and mode chosen
set -euo pipefail
. "$(dirname "$0")/lib.sh"

run() { printf '{"environment":"%s","scope":"%s","secrets":"infra-%s"}' "$1" "$2" "$3"; }

plan='' apply=''
case "$SMARTLEDGER_TRIGGER" in
  review) ;;
  push)
    if [ "$SMARTLEDGER_REF" = main ]; then
      plan=$(run production all production-plan) apply=$(run production all production)
    else
      plan=$(run staging app staging) apply=$(run staging app staging)
    fi
    ;;
  manual)
    : "${INFRA_ENVIRONMENT:?set by the manual input environment}" "${INFRA_SCOPE:?set by the manual input scope}" \
      "${INFRA_MODE:?set by the manual input mode}"
    if [ "$INFRA_MODE" = apply ]; then
      apply=$(run "$INFRA_ENVIRONMENT" "$INFRA_SCOPE" "$INFRA_ENVIRONMENT")
    elif [ "$INFRA_ENVIRONMENT" = staging ]; then
      plan=$(run staging "$INFRA_SCOPE" staging)
    else
      plan=$(run production "$INFRA_SCOPE" production-plan)
    fi
    ;;
  *) ci_error "Unknown trigger '$SMARTLEDGER_TRIGGER'; use review, push or manual."; exit 1 ;;
esac
approval=false
case "$apply" in *'"environment":"production"'*) approval=true ;; esac
echo "Plan: ${plan:-none}"
echo "Apply: ${apply:-none}, approval: $approval"
ci_output plan "$plan"
ci_output apply "$apply"
ci_output approval "$approval"
