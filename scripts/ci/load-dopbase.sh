#!/usr/bin/env bash
# Usage: load-dopbase.sh <project>/<environment> <key-regex>
# Loads the Dopbase keys of one environment whose names match the regex into the later steps of the job, under their
# Dopbase names, so a step reads them as shell variables. Each value is masked in the log. Needs DOPBASE_URL and
# DOPBASE_TOKEN (a runner token of that environment) and the CLI from .github/actions/setup-dopbase.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

target="${1:?usage: load-dopbase.sh <project>/<environment> <key-regex>}"
pattern="${2:?usage: load-dopbase.sh <project>/<environment> <key-regex>}"
umask 077
file="$(mktemp)"
trap 'rm -f "$file"' EXIT
dopbase export "$target" --stdout --format dotenv | sed -E 's/^export[[:space:]]+//' > "$file"
matches="$(grep -E "^($pattern)=" "$file" || true)"
[ -n "$matches" ] || { ci_error "Dopbase $target holds no key matching $pattern"; exit 1; }
while IFS= read -r line; do
  name="${line%%=*}"
  value="${line#*=}"
  ci_running && echo "::add-mask::$value"
  ci_env "$name" "$value"
done <<< "$matches"
