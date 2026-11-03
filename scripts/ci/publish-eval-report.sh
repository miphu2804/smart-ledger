#!/usr/bin/env bash
# Adds the eval report to the run summary and to the open pull request of SMARTLEDGER_REF, as one comment per pull
# request: found by its marker and edited on the next run. Needs GH_TOKEN. Does nothing when the run stopped before
# scoring (no report) or the branch has no open pull request.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

report="$(ci_temp_dir)/report.md"
[ -f "$report" ] || { echo "No report: the run stopped before scoring." | ci_summary; exit 0; }
ci_summary < "$report" > /dev/null
pr=$(gh pr list --repo "$SMARTLEDGER_REPOSITORY" --head "$SMARTLEDGER_REF" --state open --json number --jq '.[0].number // empty')
[ -n "$pr" ] || exit 0
marker='<!-- agent-chat-eval -->'
body="$(printf '%s\n%s\n\n[Workflow run](%s)\n' "$marker" "$(cat "$report")" "$SMARTLEDGER_RUN_URL")"
comment=$(gh api "repos/$SMARTLEDGER_REPOSITORY/issues/$pr/comments" --paginate \
  --jq ".[] | select(.user.login == \"github-actions[bot]\" and (.body | startswith(\"$marker\"))) | .id" | sed -n 1p)
if [ -n "$comment" ]; then
  gh api -X PATCH "repos/$SMARTLEDGER_REPOSITORY/issues/comments/$comment" -f body="$body" > /dev/null
else
  gh api "repos/$SMARTLEDGER_REPOSITORY/issues/$pr/comments" -f body="$body" > /dev/null
fi
