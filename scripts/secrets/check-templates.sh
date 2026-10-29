#!/bin/sh
# Compares the key names of secrets/templates/ with Dopbase and with the committed .env.example files; values are
# never read. Exits 1 on a key that Dopbase holds and its template lacks (a pull would put it under Ungrouped), or a
# template key that no Dopbase environment holds. A template key missing from an .env.example is only listed: the
# examples are for a dev machine and leave out keys that only the VPS sets, such as JAVA_TOOL_OPTIONS.
# Needs the dopbase CLI, logged in once; listing keys asks for no password.
# Usage: scripts/secrets/check-templates.sh
cd "$(git rev-parse --show-toplevel)" || exit 1

status=0
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

template_keys() { grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$1" | sed 's/=.*//' | sort -u; }

# Prints the template keys of Dopbase project $1 that no environment of it holds, and the keys of its environments
# that the template lacks.
check_project() {
  template="$2"
  : > "$tmp/held"
  for environment in $(dopbase env list "$1" --json | jq -r '.[].name'); do
    dopbase secret list "$1/${environment##*/}" --json | jq -r '.[].key' >> "$tmp/held"
  done
  sort -u -o "$tmp/held" "$tmp/held"
  template_keys "$template" > "$tmp/known"
  for key in $(comm -23 "$tmp/held" "$tmp/known"); do echo "$1: $key is in Dopbase, not in $template"; status=1; done
  for key in $(comm -13 "$tmp/held" "$tmp/known"); do echo "$1: $key is in $template, not in Dopbase"; status=1; done
}

# Lists the template keys and groups that example $2 lacks.
check_example() {
  template_keys "$1" > "$tmp/known"
  template_keys "$2" > "$tmp/shown"
  for key in $(comm -23 "$tmp/known" "$tmp/shown"); do echo "note: $2 lacks $key from $1"; done
  grep '^### ' "$1" | while IFS= read -r group; do
    grep -qxF "$group" "$2" || echo "note: $2 lacks the group $group from $1"
  done
}

for project in $(dopbase project list --json | jq -r '.[].name'); do
  case "$project" in
    github-*) template="secrets/templates/github/.env.${project#github-}" ;;
    *) template="secrets/templates/.env.$project" ;;
  esac
  [ -f "$template" ] || { echo "$project: no $template"; status=1; continue; }
  check_project "$project" "$template"
done

check_example secrets/templates/.env.core backend/core/.env.example
check_example secrets/templates/.env.ai backend/ai/.env.example
check_example secrets/templates/.env.mobile frontend/mobile/.env.example

[ "$status" -eq 0 ] && echo "templates match Dopbase and the examples"
exit "$status"
