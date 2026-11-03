#!/usr/bin/env bash
# Writes ci-summary.md, one table of the results and test counts of the CI jobs, and adds it to the run summary.
# Reads AI_RESULT, AI_TESTS, AI_FAILURES, AI_ERRORS, AI_SKIPPED, the same CORE_* and MOBILE_RESULT, LANDING_RESULT and
# CONTAINER_RESULT; a count that is empty shows as n/a.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

{
  echo "# CI results"
  echo
  echo "| Suite | Result | Tests | Failures | Errors | Skipped |"
  echo "|---|---:|---:|---:|---:|---:|"
  printf '| AI (Python) | %s | %s | %s | %s | %s |\n' \
    "$AI_RESULT" "${AI_TESTS:-n/a}" "${AI_FAILURES:-n/a}" "${AI_ERRORS:-n/a}" "${AI_SKIPPED:-n/a}"
  printf '| Core (Java) | %s | %s | %s | %s | %s |\n' \
    "$CORE_RESULT" "${CORE_TESTS:-n/a}" "${CORE_FAILURES:-n/a}" "${CORE_ERRORS:-n/a}" "${CORE_SKIPPED:-n/a}"
  printf '| Mobile web | %s | n/a | n/a | n/a | n/a |\n' "$MOBILE_RESULT"
  printf '| Landing (web) | %s | n/a | n/a | n/a | n/a |\n' "$LANDING_RESULT"
  printf '| Container images | %s | n/a | n/a | n/a | n/a |\n' "$CONTAINER_RESULT"
} > ci-summary.md
ci_summary < ci-summary.md
