#!/bin/sh
# Copies everything in an environment's R2 bucket (every pushed version, still encrypted) to a new bucket, then points
# r2-<environment> at it. The old bucket is left untouched and remembered on this machine as r2-<environment>-old, so
# clean.sh can empty it once the team has moved over. Commit .dvc/config afterwards and give teammates a token for the
# new bucket. The copy goes through a temporary folder because the two buckets may need different tokens.
#   migrate.sh <environment> --url s3://new-bucket --key-id ID --secret SECRET [--endpoint https://...]
cd "$(git rev-parse --show-toplevel)" || exit 1
. scripts/secrets/lib.sh
usage="migrate.sh <environment> --url s3://bucket --key-id ID --secret SECRET [--endpoint URL]"
require_environment "$1" "$usage"
require_admin
environment="$1" remote="r2-$1"
shift
old_url="$(dvc config "remote.$remote.url")"
old_endpoint="$(dvc config "remote.$remote.endpointurl")"
old_key_id="$(dvc config --local "remote.$remote.access_key_id")"
old_secret="$(dvc config --local "remote.$remote.secret_access_key")"
region="$(dvc config "remote.$remote.region")"
endpoint="$old_endpoint"
while [ $# -gt 1 ]; do
  case "$1" in
    --url) url="$2" ;;
    --endpoint) endpoint="$2" ;;
    --key-id) key_id="$2" ;;
    --secret) secret="$2" ;;
    *) echo "$usage" >&2; exit 1 ;;
  esac
  shift 2
done
[ -n "$url" ] && [ -n "$key_id" ] && [ -n "$secret" ] || { echo "$usage" >&2; exit 1; }
[ "$url" != "$old_url" ] || { echo "migrate: $remote already uses $url" >&2; exit 1; }

# Runs aws s3 with the given token: s3 <key id> <secret> <endpoint> <aws s3 arguments>.
s3() {
  AWS_ACCESS_KEY_ID="$1" AWS_SECRET_ACCESS_KEY="$2" AWS_DEFAULT_REGION="${region:-auto}" \
    aws s3 --endpoint-url "$3" --only-show-errors "$4" "$5" "$6"
}
count() { AWS_ACCESS_KEY_ID="$1" AWS_SECRET_ACCESS_KEY="$2" AWS_DEFAULT_REGION="${region:-auto}" aws s3 ls "$4" --recursive --endpoint-url "$3" | wc -l | tr -d ' '; }

copy="$(mktemp -d)"
trap 'rm -rf "$copy"' EXIT
echo "migrate: downloading $old_url"
s3 "$old_key_id" "$old_secret" "$old_endpoint" sync "$old_url" "$copy" || exit 1
echo "migrate: uploading to $url"
s3 "$key_id" "$secret" "$endpoint" sync "$copy" "$url" || exit 1
expected="$(find "$copy" -type f | wc -l | tr -d ' ')"
found="$(count "$key_id" "$secret" "$endpoint" "$url")" || exit 1
[ "$found" -ge "$expected" ] || { echo "migrate: $url holds $found of $expected objects; nothing switched" >&2; exit 1; }

dvc remote add --local -f "$remote-old" "$old_url"
dvc remote modify --local "$remote-old" endpointurl "$old_endpoint"
dvc remote modify --local "$remote-old" access_key_id "$old_key_id"
dvc remote modify --local "$remote-old" secret_access_key "$old_secret"
dvc remote modify "$remote" url "$url"
dvc remote modify "$remote" endpointurl "$endpoint"
dvc remote modify --local "$remote" access_key_id "$key_id"
dvc remote modify --local "$remote" secret_access_key "$secret"
echo "migrate: copied $expected objects; $remote now uses $url and the old bucket is untouched."
echo "Next: commit .dvc/config, give teammates a token for the new bucket, then empty the old one with clean.sh $environment."
