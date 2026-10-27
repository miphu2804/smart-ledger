#!/bin/sh
# Sets the GitHub Actions secrets of an environment from its env files, so a secret has one value to keep.
# Each `# NAME` line under "## Secrets" in secrets/<environment>/env/github/.env.<github environment> is looked up
# in the service files (.env.core, .env.ai, .env.vps, .env.railway.tokens); names found there are set, the rest are listed.
# A dry run by default; values are never printed.
#   github.sh <environment> [--apply]
cd "$(git rev-parse --show-toplevel)" || exit 1
. scripts/secrets/lib.sh
usage="github.sh <environment> [--apply]"
require_environment "$1" "$usage"
env="secrets/$1/env"
[ "$2" = --apply ] && apply=1
[ -z "$2" ] || [ -n "$apply" ] || { echo "$usage" >&2; exit 1; }

# Prints the value of key $1 from the first service file that has it, without surrounding quotes.
value() {
  for file in "$env/.env.core" "$env/.env.ai" "$env/.env.vps" "$env/.env.railway.tokens"; do
    [ -f "$file" ] || continue
    line="$(grep -m1 "^$1=" "$file")" || continue
    printf '%s' "${line#*=}" | sed -E "s/^'(.*)'\$/\1/; s/^\"(.*)\"\$/\1/"
    return
  done
  return 1
}

for file in "$env"/github/.env.*; do
  github_env="${file##*/.env.}"
  names="$(sed -n '/^## Secrets/,$p' "$file" | sed -nE 's/^# ([A-Z_][A-Z0-9_]*)$/\1/p')"
  [ -n "$names" ] || continue
  echo "$github_env:"
  for name in $names; do
    if ! secret="$(value "$name")" || [ -z "$secret" ]; then
      echo "  ? $name (not in the service files; set it in GitHub by hand)"
    elif [ -n "$apply" ]; then
      printf '%s' "$secret" | gh secret set "$name" --env "$github_env" >/dev/null && echo "  = $name set" || exit 1
    else
      echo "  = $name"
    fi
  done
done
[ -n "$apply" ] || echo "dry run; rerun with --apply to set the secrets marked ="
