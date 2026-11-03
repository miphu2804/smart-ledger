#!/usr/bin/env bash
# Prints which areas the change touches as name=true|false lines (a step output on GitHub), from the files that differ
# between SMARTLEDGER_BASE (a commit; empty or unknown means the commit before HEAD) and HEAD. Needs the full history.
# The areas and their paths are in docs/development/ci-cd.md#path-filtering; ci.yml runs the jobs of an area on `true`.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

# The paths of an area. A change to ci.yml, cd.yml, select-runner.yml or scripts/ci/ runs everything, because the jobs
# and deploys run those scripts; the deploy workflow of an area runs that area only.
area_patterns() {
  local common='.github/workflows/ci.yml .github/workflows/select-runner.yml .github/workflows/cd.yml scripts/ci/*'
  case "$1" in
    ai) echo "$common .github/workflows/deploy-backend.yml backend/ai/* supabase/*" ;;
    core) echo "$common .github/workflows/deploy-backend.yml backend/core/*" ;;
    mobile) echo "$common .github/workflows/deploy-web.yml frontend/mobile/*" ;;
    landing) echo "$common .github/workflows/deploy-landing.yml frontend/web/*" ;;
    containers) echo "$common compose.yaml backend/ai/* backend/core/*" ;;
    shell) echo ".shellcheckrc .github/workflows/* *.sh" ;;
  esac
}

base="${SMARTLEDGER_BASE:-}"
if [ -n "$base" ] && git cat-file -e "$base^{commit}" 2> /dev/null; then
  range="$base...HEAD"
else
  range="HEAD~1...HEAD"
fi
files="$(git diff --no-renames --name-only "$range")"
echo "Changed files in $range:" >&2
echo "$files" >&2

set -f # the patterns are for `case`, not for the file system
for area in ai core mobile landing containers shell; do
  patterns="$(area_patterns "$area")"
  changed=false
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    for pattern in $patterns; do
      # shellcheck disable=SC2254 # the unquoted pattern is the point
      case "$file" in $pattern) changed=true ;; esac
    done
  done <<< "$files"
  ci_output "$area" "$changed"
done
