#!/bin/sh
# Moves the env files of one environment between secrets/<environment>/env/ and Dopbase, so every teammate
# pulls the same values from one server. All files of an environment share the Dopbase environment
# smartledger/<environment>, each key prefixed by its file, because the CLI asks for the password on every
# export and one environment keeps that to one prompt per pull:
#   secrets/staging/env/.env.core                DATABASE_URL  <->  CORE__DATABASE_URL
#   secrets/staging/env/github/.env.web-staging  TOKEN         <->  GITHUB_WEB_STAGING__TOKEN
# A file whose name holds `.` or `_` (.env.railway.tokens) is skipped: its prefix would not map back to it.
# Needs the dopbase CLI, logged in once with `dopbase client connect <url>` and `dopbase login`.
# Usage: scripts/secrets/dopbase-sync.sh push|pull <environment>
set -eu
cd "$(git rev-parse --show-toplevel)"
action="${1:?usage: dopbase-sync.sh push|pull <environment>}"
environment="${2:?usage: dopbase-sync.sh push|pull <environment>}"
dir="secrets/$environment/env"
target="smartledger/$environment"

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
  dopbase project show smartledger >/dev/null 2>&1 || dopbase project create smartledger >/dev/null
  dopbase env show "$target" >/dev/null 2>&1 || dopbase env create "$target" >/dev/null
  for file in "$dir"/.env.* "$dir"/github/.env.*; do
    [ -f "$file" ] || continue
    case "${file##*/.env.}" in *[._]*) echo "dopbase-sync: skipped $file; its name holds . or _" >&2; continue ;; esac
    prefix="$(prefix_of "$file")"
    sed -E "s/^(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=/${prefix}\2=/" "$file"
    echo "dopbase-sync: pushed $file as ${prefix}*" >&2
  done | dopbase import "$target" - --format dotenv >/dev/null
}

# Splits one export back into files by key prefix. Files are built in a temporary directory first, so a
# failed export leaves the current env/ untouched.
pull() {
  build="$(mktemp -d)"
  trap 'rm -rf "$build"' EXIT
  mkdir "$build/github"
  (umask 077 && dopbase export "$target" --stdout --format dotenv >"$build/all")
  awk -v out="$build" '
    # The prefix ends at the first "__", so a key that itself holds "__" keeps it.
    match($0, /^[A-Z0-9_]+=/) && (cut = index($0, "__")) > 0 && cut < RLENGTH {
      id = tolower(substr($0, 1, cut - 1)); gsub("_", "-", id)
      file = (id ~ /^github-/) ? out "/github/.env." substr(id, 8) : out "/.env." id
      $0 = substr($0, cut + 2)
    }
    file { print > file }
  ' "$build/all"
  rm "$build/all"
  (cd "$build" && find . -type f) | while read -r file; do
    mkdir -p "$(dirname "$dir/$file")"
    mv "$build/$file" "$dir/$file"
    chmod 600 "$dir/$file"
    echo "dopbase-sync: pulled $dir/${file#./}"
  done
}

prefix_of() {
  name="${1#"$dir"/}"
  case "$name" in
    github/*) name="github-${name#github/.env.}" ;;
    *) name="${name#.env.}" ;;
  esac
  echo "${name}__" | tr 'a-z-' 'A-Z_'
}

main
