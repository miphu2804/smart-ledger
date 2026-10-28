# Helpers sourced by the scripts in scripts/secrets/.

# Exits with the usage line $2 unless $1 is an environment the team keeps env files for.
require_environment() {
  case "$1" in staging|production) return ;; esac
  echo "usage: $2" >&2
  echo "environments: staging production" >&2
  exit 1
}

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
