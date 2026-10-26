#!/bin/sh
# Writes each section of the decrypted bundles secrets/<environment>/.env to the env file it names.
# A bundle section starts at a "# <title> -> <path>" line and runs to the next one.
# By default it is a dry run listing which keys would be added (+), changed (~) or dropped (-);
# values are never printed. Pass --apply to write; each replaced file is kept as <file>.bak.
cd "$(git rev-parse --show-toplevel)" || exit 1
[ "$1" = "--apply" ] && apply=1

main() {
  sections=$(mktemp -d) || exit 1
  trap 'rm -rf "$sections"' EXIT
  for bundle in secrets/*/.env; do
    [ -f "$bundle" ] || continue
    split_sections "$bundle" "$sections"
  done
  for section in "$sections"/*; do
    [ -f "$section" ] || { echo "secrets: nothing pulled yet; run scripts/secrets/pull.sh"; break; }
    target=$(head -n 1 "$section")
    body="$section.body"
    tail -n +2 "$section" > "$body"
    current="$target"
    [ -f "$current" ] || current=/dev/null
    changes=$(key_changes "$body" "$current")
    [ -n "$changes" ] || { echo "$target: up to date"; continue; }
    echo "$target:"
    echo "$changes"
    [ -n "$apply" ] || continue
    [ -f "$target" ] && cp -p "$target" "$target.bak"
    mkdir -p "$(dirname "$target")"
    (umask 077 && cp "$body" "$target")
  done
  [ -n "$apply" ] || echo "dry run; rerun with --apply to write"
}

# Writes every section of bundle $1 to its own file in directory $2: the target path, then the body.
split_sections() {
  umask 077
  # Section files are named after the environment folder; a dotted name would hide them from the glob.
  awk -v dir="$2" -v name="$(basename "$(dirname "$1")")" '
    /^# .+ -> [^ ]+$/ {
      if (out) close(out)
      out = sprintf("%s/%s.%03d", dir, name, ++count)
      target = $0; sub(/.* -> /, "", target)
      print target > out
      started = blanks = 0
      next
    }
    !out { next }
    # Blank lines between sections belong to no file; keep only those inside a body.
    /^$/ { if (started) blanks++; next }
    { started = 1; for (; blanks > 0; blanks--) print "" > out; print > out }
  ' "$1"
}

# Compares KEY=value lines of the new file ($1) against the current one ($2) by key name.
key_changes() {
  awk '
    !/^[A-Za-z_][A-Za-z0-9_]*=/ { next }
    { key = substr($0, 1, index($0, "=") - 1); value = substr($0, index($0, "=") + 1) }
    FILENAME == ARGV[1] { incoming[key] = value; next }
    { existing[key] = value }
    END {
      for (key in incoming)
        if (!(key in existing)) print "  + " key
        else if (incoming[key] != existing[key]) print "  ~ " key
      for (key in existing) if (!(key in incoming)) print "  - " key
    }' "$1" "$2" | sort -k2
}

main
