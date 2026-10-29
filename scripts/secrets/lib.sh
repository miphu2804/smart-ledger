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

# Writes Dopbase environment $1 as a dotenv file $2, readable only by you. The CLI confirms every export with your
# password on a terminal and reads no other input, so the password is asked once per script and typed into each
# prompt by expect(1), which ships with macOS.
dopbase_export() {
  if [ -z "${dopbase_password:-}" ]; then
    printf 'Dopbase password: ' >&2
    stty -echo; IFS= read -r dopbase_password; stty echo; echo >&2
  fi
  rm -f "$2"
  (umask 077 && DOPBASE_PASSWORD="$dopbase_password" expect -c "
    log_user 0
    spawn dopbase export {$1} --output {$2} --format dotenv
    expect -re {[Pp]assword:} { send -- \"\$env(DOPBASE_PASSWORD)\r\" }
    expect eof
    set code [lindex [wait] 3]
    regsub -all {\x1b\[[0-9;?]*[A-Za-z]} \$expect_out(buffer) {} out
    if {\$code != 0} { puts stderr [lindex [split [string trim \$out] \n] end] }
    exit \$code") || { echo "dopbase export of $1 failed" >&2; return 1; }
}

# Prints the KEY=value lines of file $2 in the order, groups and comments of template $1 (secrets/templates/).
# Dopbase stores no groups, so a template is the only record of them. A group with none of its keys in $2 is left
# out, so one template serves staging and production. A key the template lacks goes under "### Ungrouped ###",
# and is named on stderr so someone adds it to the template.
lay_out() {
  awk -v template="$1" '
    FNR == NR {
      if ($0 !~ /^[A-Za-z_][A-Za-z0-9_]*=/) next
      key = substr($0, 1, index($0, "=") - 1)
      value[key] = $0; order[++count] = key
      next
    }
    /^### .* ###$/ { group++ }
    { line[++lines] = $0; owner[lines] = group }
    /^[A-Za-z_][A-Za-z0-9_]*=/ {
      key = substr($0, 1, index($0, "=") - 1)
      known[key] = 1
      if (key in value) present[group] = 1
    }
    END {
      for (i = 1; i <= lines; i++) {
        if (line[i] ~ /^[A-Za-z_][A-Za-z0-9_]*=/) {
          key = substr(line[i], 1, index(line[i], "=") - 1)
          if (key in value) out[++n] = value[key]
        } else if (owner[i] == 0 || present[owner[i]]) out[++n] = line[i]
      }
      for (i = 1; i <= count; i++)
        if (!(order[i] in known)) {
          if (!extra++) { out[++n] = ""; out[++n] = "### Ungrouped ###" }
          out[++n] = value[order[i]]
          print "not in " template ": " order[i] > "/dev/stderr"
        }
      while (n > 0 && out[n] == "") n--
      for (i = 1; i <= n; i++) print out[i]
    }' "$2" "$1"
}
