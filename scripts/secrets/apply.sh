#!/bin/sh
# Copies the env files listed in secrets/<environment>/targets from env/ to the path a tool reads them at.
# By default it is a dry run listing which keys would be added (+), changed (~) or dropped (-);
# values are never printed. Pass --apply to write; each replaced file is kept as <file>.bak.
cd "$(git rev-parse --show-toplevel)" || exit 1
. scripts/secrets/lib.sh
[ "$1" = "--apply" ] && apply=1

main() {
  for targets in secrets/*/targets; do
    environment="$(dirname "$targets")"
    grep -v '^#' "$targets" | while read -r name target; do
      [ -n "$name" ] && copy "$environment/env/$name" "$target"
    done
  done
  [ -n "$apply" ] || echo "dry run; rerun with --apply to write"
}

copy() {
  [ -f "$1" ] || { echo "$1: missing; run scripts/secrets/pull.sh"; return; }
  current="$2"
  [ -f "$current" ] || current=/dev/null
  cmp -s "$1" "$current" && { echo "$2: up to date"; return; }
  changes=$(key_changes "$1" "$current")
  echo "$2:"
  echo "${changes:-  (comments or layout only)}"
  [ -n "$apply" ] || return
  [ -f "$2" ] && cp -p "$2" "$2.bak"
  mkdir -p "$(dirname "$2")"
  (umask 077 && cp "$1" "$2")
}

main
