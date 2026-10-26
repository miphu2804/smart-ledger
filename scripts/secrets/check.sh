#!/bin/sh
# Lists the latest versions of secrets/<environment>/env/: who committed each pointer, when, and which
# files and keys it added (+), changed (~) or dropped (-) against the version before it. Values are never printed.
# Usage: check.sh <environment> [count]; count defaults to 5. Reads only; env/ and the pointer stay as they are.
KEY="${SMARTLEDGER_AGE_KEY:-$HOME/.config/smartledger/age.key}"
cd "$(git rev-parse --show-toplevel)" || exit 1
. scripts/secrets/lib.sh
require_environment "$1" "check.sh <environment> [count]"
name="$1"
environment="secrets/$name"
count="${2:-5}"
# Old versions are decrypted here to compare them, then deleted on exit.
umask 077
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

main() {
  dvc fetch -q --all-commits -r "r2-$name" "$environment/env.age.dvc" 2>/dev/null \
    || echo "secrets: could not fetch old versions from R2; their changes show as unavailable" >&2
  # One version more than shown, so the oldest row still has a version to compare against.
  git log -n "$((count + 1))" --format='%h|%an|%ad' --date=format:'%Y-%m-%d %H:%M' \
    -- "$environment/env.age.dvc" > "$work/log"
  total=$(wc -l < "$work/log")
  i=0
  while IFS='|' read -r commit author date; do
    i=$((i + 1))
    decrypt "$commit" "$work/$i" > "$work/$i.md5"
  done < "$work/log"

  echo "$environment, newest first"
  echo
  printf ' %-9s %-17s %-20s %-8s %s\n' VER TIME BY COMMIT CHANGES
  i=0
  while IFS='|' read -r commit author date && [ "$i" -lt "$count" ]; do
    i=$((i + 1))
    changes "$i" "$((i + 1))" "$total" > "$work/changes"
    printf ' %-9.8s %-17s %-20.20s %-8s %s\n' "$(cat "$work/$i.md5")" "$date" "$author" "$commit" "$(head -1 "$work/changes")"
    sed 1d "$work/changes" | sed 's/^/                                                           /'
  done < "$work/log"
  echo
  status
}

# Decrypts the env.age/ that commit $1 points at into directory $2, from DVC's cache, and prints its md5.
# A version that cannot be read leaves $2.failed behind instead.
decrypt() {
  md5=$(git show "$1:$environment/env.age.dvc" | awk '/md5:/ { print $2 }')
  echo "$md5"
  manifest=".dvc/cache/files/md5/$(echo "$md5" | cut -c1-2)/$(echo "$md5" | cut -c3-)"
  mkdir "$2"
  [ -f "$manifest" ] || { touch "$2.failed"; return; }
  # The manifest is DVC's JSON list of {"md5": ..., "relpath": ...}, one entry per encrypted file.
  # The manifest has no trailing newline; the echo stops read from dropping its last entry.
  { tr '{' '\n' < "$manifest"; echo; } | sed -n 's/.*"md5": *"\([0-9a-f]*\)".*"relpath": *"\([^"]*\)\.age".*/\1 \2/p' |
    while read -r file_md5 relpath; do
      mkdir -p "$(dirname "$2/$relpath")"
      age -d -i "$KEY" -o "$2/$relpath" ".dvc/cache/files/md5/$(echo "$file_md5" | cut -c1-2)/$(echo "$file_md5" | cut -c3-)" 2>/dev/null \
        || touch "$2.failed"
    done
}

# Prints one line per file that differs between version $1 and the older version $2.
changes() {
  if [ "$2" -gt "$3" ]; then
    echo "(first version, $(cd "$work/$1" && find . -type f | wc -l | tr -d ' ') files)"
    return
  fi
  if [ -f "$work/$1.failed" ] || [ -f "$work/$2.failed" ]; then
    echo "(unavailable: $KEY cannot decrypt it, or it is missing from R2)"
    return
  fi
  { (cd "$work/$1" && find . -type f); (cd "$work/$2" && find . -type f); } | sed 's#^\./##' | sort -u |
    while read -r file; do
      new="$work/$1/$file"
      old="$work/$2/$file"
      if [ ! -f "$old" ]; then echo "+ $file"
      elif [ ! -f "$new" ]; then echo "- $file"
      elif ! cmp -s "$new" "$old"; then
        keys=$(key_changes "$new" "$old" | sed 's/^ *//' | paste -sd ',' - | sed 's/,/, /g')
        echo "~ $file: ${keys:-comments or layout only}"
      fi
    done > "$work/files"
  if [ -s "$work/files" ]; then cat "$work/files"; else echo "(no change)"; fi
}

status() {
  current=$(pointer_md5 "$environment" | awk '{ print substr($2, 1, 8) }')
  if [ ! -d "$environment/env" ]; then state="not pulled; run pull.sh"
  elif has_unpushed_edits "$environment"; then state="has edits not pushed yet"
  elif matches_pointer "$environment"; then state="matches, no unpushed edits"
  else state="older than the pointer; run pull.sh"
  fi
  echo " current checkout: $current   env/: $state"
}

main
