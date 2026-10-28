#!/bin/sh
# Moves the env files of one environment between secrets/<environment>/env/ and Dopbase, so every teammate
# pulls the same values from one server. Each file is its own Dopbase project, so the web UI and access rules
# split by service, and the stage is the Dopbase environment:
#   secrets/staging/env/.env.core                    <->  core/staging
#   secrets/staging/env/github/.env.vercel-staging   <->  github-vercel-staging/staging
# The Dopbase instance serves only SmartLedger, so every project on it maps to a file.
# A file whose name holds `.` or `_` (.env.railway.tokens) is skipped: Dopbase project names allow neither.
# The CLI asks for the password on every export, so a pull asks once per file.
# Needs the dopbase CLI, logged in once with `dopbase client connect <url>` and `dopbase login`.
# Usage: scripts/secrets/dopbase-sync.sh push|pull <environment>
set -eu
cd "$(git rev-parse --show-toplevel)"
action="${1:?usage: dopbase-sync.sh push|pull <environment>}"
environment="${2:?usage: dopbase-sync.sh push|pull <environment>}"
dir="secrets/$environment/env"

main() {
  case "$action" in
    push) push ;;
    pull) pull ;;
    *) echo "dopbase-sync: unknown action $action (push or pull)" >&2; exit 2 ;;
  esac
}

# Import merges into Dopbase: a key deleted from a file stays there until removed with `dopbase secret delete`.
# Dopbase's dotenv import rejects multi-line values, so every value must stay on its key's line.
push() {
  for file in "$dir"/.env.* "$dir"/github/.env.*; do
    [ -f "$file" ] || continue
    case "${file##*/.env.}" in *[._]*) echo "dopbase-sync: skipped $file; its name holds . or _" >&2; continue ;; esac
    grep -qE '^(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=' "$file" || { echo "dopbase-sync: skipped $file; it holds no keys" >&2; continue; }
    project="$(project_of "$file")"
    dopbase project show "$project" >/dev/null 2>&1 || dopbase project create "$project" >/dev/null
    dopbase env show "$project/$environment" >/dev/null 2>&1 || dopbase env create "$project/$environment" >/dev/null
    sed -E 's/^export[[:space:]]+//' "$file" | dopbase import "$project/$environment" - --format dotenv >/dev/null
    echo "dopbase-sync: pushed $file to $project/$environment"
  done
}

# Each file is exported to a temporary path first, so a failed export leaves the current file untouched.
pull() {
  build="$(mktemp -d)"
  trap 'rm -rf "$build"' EXIT
  # A plain list, not a pipe into the loop: the password prompt of each export needs the terminal's stdin.
  projects="$(dopbase project list --json | jq -r '.[].name')"
  for project in $projects; do
    dopbase env show "$project/$environment" >/dev/null 2>&1 || continue
    file="$dir/$(file_of "$project")"
    (umask 077 && dopbase export "$project/$environment" --stdout --format dotenv >"$build/env")
    mkdir -p "$(dirname "$file")"
    mv "$build/env" "$file"
    chmod 600 "$file"
    echo "dopbase-sync: pulled $file"
  done
}

project_of() {
  case "${1#"$dir"/}" in
    github/*) echo "github-${1##*/.env.}" ;;
    *) echo "${1##*/.env.}" ;;
  esac
}

file_of() {
  case "$1" in
    github-*) echo "github/.env.${1#github-}" ;;
    *) echo ".env.$1" ;;
  esac
}

main
