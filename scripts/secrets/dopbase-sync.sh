#!/bin/sh
# Copies the env files of one environment between Dopbase and secrets/<environment>/env/. Dopbase is the source:
# change a value there (web UI or `dopbase secret set`) and pull; `seed` only loads a file whose Dopbase environment
# does not exist yet, such as a new service. Each service is its own Dopbase project, so the web UI and access rules
# split by service, and the stage is the Dopbase environment. A GitHub environment file is named
# <service>-<stage>, so its stage comes from the name; `dev` files live in the staging folder:
#   secrets/staging/env/.env.core                    <->  core/staging
#   secrets/staging/env/github/.env.vercel-staging   <->  github-vercel/staging
#   secrets/staging/env/github/.env.android-dev      <->  github-android/dev
# The Dopbase instance serves only SmartLedger, so every project on it maps to a file.
# A file whose name holds `.` or `_` (.env.railway.tokens) is skipped: Dopbase project names allow neither.
# The CLI asks for the password on every export, so a pull asks once per file.
# Needs the dopbase CLI, logged in once with `dopbase client connect <url>` and `dopbase login`.
# Usage: scripts/secrets/dopbase-sync.sh seed|pull <environment>
set -eu
cd "$(git rev-parse --show-toplevel)"
action="${1:?usage: dopbase-sync.sh seed|pull <environment>}"
environment="${2:?usage: dopbase-sync.sh seed|pull <environment>}"
dir="secrets/$environment/env"

main() {
  case "$action" in
    seed) seed ;;
    pull) pull ;;
    *) echo "dopbase-sync: unknown action $action (seed or pull)" >&2; exit 2 ;;
  esac
}

# Dopbase's dotenv import rejects multi-line values, so every value must stay on its key's line.
seed() {
  for file in "$dir"/.env.* "$dir"/github/.env.*; do
    [ -f "$file" ] || continue
    case "${file##*/.env.}" in *[._]*) echo "dopbase-sync: skipped $file; its name holds . or _" >&2; continue ;; esac
    grep -qE '^(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=' "$file" || { echo "dopbase-sync: skipped $file; it holds no keys" >&2; continue; }
    target="$(target_of "$file")"
    project="${target%/*}"
    if dopbase env show "$target" >/dev/null 2>&1; then
      echo "dopbase-sync: kept $target; it exists, so change it in Dopbase" >&2
      continue
    fi
    dopbase project show "$project" >/dev/null 2>&1 || dopbase project create "$project" >/dev/null
    dopbase env create "$target" >/dev/null
    sed -E 's/^export[[:space:]]+//' "$file" | dopbase import "$target" - --format dotenv >/dev/null
    echo "dopbase-sync: seeded $target from $file"
  done
}

# Each file is exported to a temporary path first, so a failed export leaves the current file untouched.
pull() {
  build="$(mktemp -d)"
  trap 'rm -rf "$build"' EXIT
  # A plain list, not a pipe into the loop: the password prompt of each export needs the terminal's stdin.
  projects="$(dopbase project list --json | jq -r '.[].name')"
  for project in $projects; do
    case "$project" in
      github-*) for stage in $(stages_of_folder); do pull_one "$project/$stage" "github/.env.${project#github-}-$stage"; done ;;
      *) pull_one "$project/$environment" ".env.$project" ;;
    esac
  done
}

pull_one() {
  dopbase env show "$1" >/dev/null 2>&1 || return 0
  file="$dir/$2"
  (umask 077 && dopbase export "$1" --stdout --format dotenv >"$build/env")
  mkdir -p "$(dirname "$file")"
  mv "$build/env" "$file"
  chmod 600 "$file"
  echo "dopbase-sync: pulled $file"
}

# The Dopbase project/environment of a file: .env.core -> core/<environment>, github/.env.vercel-staging -> github-vercel/staging.
target_of() {
  name="${1##*/.env.}"
  case "${1#"$dir"/}" in
    github/*) echo "github-${name%-*}/${name##*-}" ;;
    *) echo "$name/$environment" ;;
  esac
}

# GitHub stages kept in this folder: `dev` has no folder of its own and sits with staging.
stages_of_folder() {
  case "$environment" in
    staging) echo "staging dev" ;;
    *) echo "$environment" ;;
  esac
}

main
