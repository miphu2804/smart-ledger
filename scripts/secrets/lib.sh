# Helpers sourced by the scripts in scripts/secrets/; $1 is secrets/<environment> unless noted.
# env/.pulled records the env.age.dvc md5 that env/ last matched (after a pull or a push),
# then a checksum of every env file, so an edit not pushed yet can be told apart from a stale copy.

# Exits with the usage line $2 unless $1 names a folder in secrets/ that has a pointer.
require_environment() {
  [ -n "$1" ] && [ -f "secrets/$1/env.age.dvc" ] && return
  echo "usage: $2" >&2
  echo "environments: $(ls secrets/*/env.age.dvc | cut -d/ -f2 | paste -sd ' ' -)" >&2
  exit 1
}

pointer_md5() { grep 'md5:' "$1/env.age.dvc"; }

checksums() { (cd "$1/env" && find . -name '.env.*' -type f -exec shasum {} + | sort -k2); }

record_state() { { pointer_md5 "$1"; checksums "$1"; } > "$1/env/.pulled"; }

# An env/ without .pulled predates this check, so it is treated as edited rather than silently replaced.
has_unpushed_edits() {
  [ -d "$1/env" ] || return 1
  [ -f "$1/env/.pulled" ] || return 0
  [ "$(checksums "$1")" != "$(sed 1d "$1/env/.pulled")" ]
}

matches_pointer() { [ -f "$1/env/.pulled" ] && [ "$(pointer_md5 "$1")" = "$(sed -n 1p "$1/env/.pulled")" ]; }

# Compares KEY=value lines of the new file ($1) against the old one ($2) by key name; values are never printed.
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
