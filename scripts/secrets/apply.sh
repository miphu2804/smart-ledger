#!/bin/sh
# Writes every file listed in secrets/staging/targets, such as backend/core/.env, as the staging file with the keys
# of secrets/local.<name> (localhost database and the like) put over it.
#
# Copying runs one way only. A target is a derived copy with no record of what it was built from, so sending it back
# could not tell your edits from keys a teammate changed since; change staging in secrets/staging/env/ and push.sh it.
#
# A dry run lists which keys would be added (+), changed (~) or dropped (-); values are never printed.
# Options: --apply writes; --no-backup skips keeping the replaced target as <file>.bak;
# --use-staging KEY (repeatable) takes the staging value of one local key.
cd "$(git rev-parse --show-toplevel)" || exit 1
. scripts/secrets/lib.sh

usage="apply.sh staging dev [--apply] [--no-backup] [--use-staging KEY]..."
[ "$1 $2" = "staging dev" ] || {
  echo "$usage" >&2
  echo "only staging to dev (this machine); change staging in secrets/staging/env/ and run push.sh staging" >&2
  exit 1
}
shift 2
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

main() {
  grep -v '^#' secrets/staging/targets | while read -r name target; do
    [ -n "$name" ] || continue
    staged="secrets/staging/env/$name"
    [ -f "$staged" ] || { echo "$staged: missing; run scripts/secrets/pull.sh"; continue; }
    built="$(mktemp)"
    local_keys "secrets/local$name" | put_over "$staged" > "$built"
    write "$built" "$target"
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

# Prints the file named in $1 with each KEY=value line read on stdin put in place of the same key.
# Keys the file lacks are appended under a "### Local ###" group.
put_over() {
  awk '
    FILENAME == "-" { key = $0; sub(/=.*/, "", key); over[key] = $0; order[++n] = key; next }
    /^[A-Za-z_][A-Za-z0-9_]*=/ {
      key = $0; sub(/=.*/, "", key)
      if (key in over) { print over[key]; used[key] = 1; next }
    }
    # A "### Local ###" group already in the file is rebuilt at the end, with the blank lines before it.
    /^### Local ###$/ { next }
    /^$/ { blanks = blanks "\n"; next }
    { printf "%s", blanks; blanks = ""; print }
    END {
      for (i = 1; i <= n; i++) if (!(order[i] in used)) extra = extra over[order[i]] "\n"
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
