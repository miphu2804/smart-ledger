#!/bin/sh
# Shows or changes where an environment's encrypted env files are stored: the R2 bucket and endpoint, which are
# shared in .dvc/config, and the token, which stays on this machine in .dvc/config.local. The secret is never printed.
#   config.sh <environment>                                  shows the current settings
#   config.sh <environment> [--url s3://bucket] [--endpoint https://...] [--key-id ID] [--secret SECRET]
cd "$(git rev-parse --show-toplevel)" || exit 1
. scripts/secrets/lib.sh
require_environment "$1" "config.sh <environment> [--url URL] [--endpoint URL] [--key-id ID] [--secret SECRET]"
remote="r2-$1"
shift
[ $# -eq 0 ] || require_admin
while [ $# -gt 1 ]; do
  case "$1" in
    --url) dvc remote modify "$remote" url "$2" ;;
    --endpoint) dvc remote modify "$remote" endpointurl "$2" ;;
    --key-id) dvc remote modify --local "$remote" access_key_id "$2" ;;
    --secret) dvc remote modify --local "$remote" secret_access_key "$2" ;;
    *) echo "config.sh: unknown option $1" >&2; exit 1 ;;
  esac || exit 1
  shift 2
done
[ $# -eq 0 ] || { echo "config.sh: $1 needs a value" >&2; exit 1; }

key_id="$(dvc config --local "remote.$remote.access_key_id" 2>/dev/null)"
echo "$remote"
echo "  bucket     $(dvc config "remote.$remote.url" 2>/dev/null)"
echo "  endpoint   $(dvc config "remote.$remote.endpointurl" 2>/dev/null)"
if [ -n "$key_id" ]; then echo "  key id     $(printf '%s' "$key_id" | cut -c1-6)…"; else echo "  key id     not set"; fi
if [ -n "$(dvc config --local "remote.$remote.secret_access_key" 2>/dev/null)" ]; then echo "  secret     set"; else echo "  secret     not set"; fi
[ -z "$(git status --porcelain .dvc/config)" ] || echo "Commit .dvc/config so the team uses the same bucket."
