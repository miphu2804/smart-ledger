#!/bin/sh
# Copies env files between staging and this machine (dev) for every file listed in secrets/staging/targets.
#
#   apply.sh staging dev  writes each target, such as backend/core/.env, as the staging file with the keys of
#                         secrets/local.<name> (localhost database and the like) put over it.
#   apply.sh dev staging  writes the keys edited in each target back into secrets/staging/env/, keeping the
#                         staging value of every key in secrets/local.<name>; run push.sh staging afterwards.
#
# Both are a dry run listing which keys would be added (+), changed (~) or dropped (-); values are never printed.
# Options: --apply writes; --no-backup skips keeping the replaced target as <file>.bak (dev staging keeps none);
# --use-staging KEY (repeatable) takes the staging value of one local key on staging dev.
cd "$(git rev-parse --show-toplevel)" || exit 1
. scripts/secrets/lib.sh

usage="apply.sh staging dev|dev staging [--apply] [--no-backup] [--use-staging KEY]..."
from="$1" to="$2"
shift 2 2>/dev/null
backup=1 use_staging=" "
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) apply=1 ;;
    --no-backup) backup= ;;
    --backup) backup=1 ;;
    --keep-all) ;;
    --use-staging) use_staging="$use_staging$2 "; shift ;;
    *) echo "$usage" >&2; exit 1 ;;
  esac
  shift
done
case "$from $to" in
  "staging dev"|"dev staging") ;;
  *) echo "$usage" >&2; echo "only staging and dev (this machine) can be copied between" >&2; exit 1 ;;
esac

main() {
  grep -v '^#' secrets/staging/targets | while read -r name target; do
    [ -n "$name" ] || continue
    staged="secrets/staging/env/$name"
    [ -f "$staged" ] || { echo "$staged: missing; run scripts/secrets/pull.sh"; continue; }
    built="$(mktemp)"
    if [ "$to" = dev ]; then
      local_keys "secrets/local$name" | put_over "$staged" > "$built"
      write "$built" "$target"
    elif [ -f "$target" ]; then
      staging_values "$staged" "secrets/local$name" | put_over "$target" > "$built"
      # No .bak here: push.sh would encrypt it with env/, and R2 keeps every pushed version anyway.
      backup= write "$built" "$staged"
    else
      echo "$target: missing; nothing to copy"
    fi
    rm -f "$built"
  done
  [ -n "$apply" ] || echo "dry run; rerun with --apply to write"
}

# Prints the KEY=value lines of a local file, minus the keys passed with --use-staging.
local_keys() {
  [ -f "$1" ] || return 0
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$1" | while IFS= read -r line; do
    case "$use_staging" in *" ${line%%=*} "*) ;; *) printf '%s\n' "$line" ;; esac
  done
}

# For every key in the local file, prints the staging line of that key, or KEY with no = when staging lacks it,
# so dev staging never sends a localhost value to staging.
staging_values() {
  [ -f "$2" ] || return 0
  grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' "$2" | tr -d = | while read -r key; do
    grep -E "^$key=" "$1" || echo "$key"
  done
}

# Prints the file named in $1 with each key read on stdin put in place of the same key; a bare KEY drops it.
# Keys the file lacks are appended under a "### Local ###" group.
put_over() {
  awk '
    FILENAME == "-" { key = $0; sub(/=.*/, "", key); over[key] = $0; order[++n] = key; next }
    /^[A-Za-z_][A-Za-z0-9_]*=/ {
      key = $0; sub(/=.*/, "", key)
      if (key in over) { if (over[key] ~ /=/) print over[key]; used[key] = 1; next }
    }
    # A "### Local ###" group left without keys, as on dev staging, is dropped with the blank lines before it.
    /^### Local ###$/ { next }
    /^$/ { blanks = blanks "\n"; next }
    { printf "%s", blanks; blanks = ""; print }
    END {
      for (i = 1; i <= n; i++) if (!(order[i] in used) && over[order[i]] ~ /=/) extra = extra over[order[i]] "\n"
      if (extra != "") printf "\n### Local ###\n%s", extra
    }
  ' - "$1"
}

write() {
  current="$2"
  [ -f "$current" ] || current=/dev/null
  cmp -s "$1" "$current" && { echo "$2: up to date"; return; }
  changes=$(key_changes "$1" "$current")
  echo "$2:"
  echo "${changes:-  (comments or layout only)}"
  [ -n "$apply" ] || return
  [ -n "$backup" ] && [ -f "$2" ] && cp -p "$2" "$2.bak"
  mkdir -p "$(dirname "$2")"
  (umask 077 && cp "$1" "$2")
}

main
