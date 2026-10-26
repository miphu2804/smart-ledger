#!/bin/sh
# Empties the bucket an environment used before migrate.sh moved it, using the r2-<environment>-old remote that
# migrate.sh left on this machine. A dry run by default; --apply deletes every object in that bucket for good.
#   clean.sh <environment> [--apply]
cd "$(git rev-parse --show-toplevel)" || exit 1
. scripts/secrets/lib.sh
require_environment "$1" "clean.sh <environment> [--apply]"
require_admin
old="r2-$1-old"
url="$(dvc config --local "remote.$old.url" 2>/dev/null)"
[ -n "$url" ] || { echo "clean: no old bucket recorded for $1; migrate.sh records one"; exit 0; }
[ "$url" != "$(dvc config "remote.r2-$1.url")" ] || { echo "clean: $url is still the current bucket; refusing" >&2; exit 1; }

export AWS_ACCESS_KEY_ID="$(dvc config --local "remote.$old.access_key_id")"
export AWS_SECRET_ACCESS_KEY="$(dvc config --local "remote.$old.secret_access_key")"
export AWS_DEFAULT_REGION="$(dvc config "remote.r2-$1.region" 2>/dev/null || echo auto)"
endpoint="$(dvc config --local "remote.$old.endpointurl")"
count="$(aws s3 ls "$url" --recursive --endpoint-url "$endpoint" | wc -l | tr -d ' ')" || exit 1
if [ "$2" != "--apply" ]; then
  echo "$url holds $count objects; rerun with --apply to delete them all"
  exit 0
fi
aws s3 rm "$url" --recursive --only-show-errors --endpoint-url "$endpoint" || exit 1
dvc remote remove --local "$old"
echo "clean: deleted $count objects from $url"
