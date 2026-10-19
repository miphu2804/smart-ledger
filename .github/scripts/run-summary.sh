#!/usr/bin/env bash
# Writes one compact Markdown report of the current workflow run to run-summary.md and to the run
# page, so a run can be judged without opening job logs: one row per finished job with its result,
# duration and first failed step. An optional Markdown file given as $1 (test counts, deploy URLs)
# is appended below the table. Needs GH_TOKEN with `actions: read`.
set -euo pipefail

extra="${1:-}"
api="repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/attempts/${GITHUB_RUN_ATTEMPT:-1}/jobs"

{
  echo "# $GITHUB_WORKFLOW"
  echo
  echo "\`$GITHUB_REF_NAME\` · \`${REPORT_SHA:-$GITHUB_SHA}\` · $GITHUB_EVENT_NAME · attempt ${GITHUB_RUN_ATTEMPT:-1} · [run]($GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID)"
  echo
  echo "| Job | Result | Time | Failed step |"
  echo "|---|---|---:|---|"
  # The report job itself is still running, so only completed jobs are listed.
  gh api "$api" --paginate --jq '
    .jobs[] | select(.status == "completed") |
    "| \(.name) | \(.conclusion) | \(
      if .conclusion == "skipped" then "—"
      else "\((.completed_at | fromdate) - (.started_at | fromdate))s" end
    ) | \([.steps[]? | select(.conclusion == "failure") | .name] | first // "") |"'
  if [ -n "$extra" ] && [ -s "$extra" ]; then
    echo
    cat "$extra"
  fi
} > run-summary.md

cat run-summary.md >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
