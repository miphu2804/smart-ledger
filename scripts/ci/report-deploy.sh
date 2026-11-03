#!/usr/bin/env bash
# Writes deploy-summary.md, a table of one backend deploy, and adds it to the run summary. Reads DEPLOY_OUTCOME,
# TARGET_ENV (the deploy environment's name) and SMARTLEDGER_DEPLOY_AI and SMARTLEDGER_DEPLOY_CORE (true|false).
set -euo pipefail
. "$(dirname "$0")/lib.sh"

{
  echo "# Deploy results"
  echo
  echo "| Item | Value |"
  echo "|---|---|"
  echo "| Environment | $TARGET_ENV |"
  echo "| Branch | $SMARTLEDGER_REF |"
  echo "| Commit | ${SMARTLEDGER_COMMIT::7} |"
  echo "| Services | $([ "$SMARTLEDGER_DEPLOY_AI" = true ] && echo -n 'ai ')$([ "$SMARTLEDGER_DEPLOY_CORE" = true ] && echo -n core) |"
  echo "| Result | $DEPLOY_OUTCOME |"
  echo "| Triggered by | $SMARTLEDGER_ACTOR |"
  echo "| Run | $SMARTLEDGER_RUN_URL |"
} > deploy-summary.md
ci_summary < deploy-summary.md
