#!/usr/bin/env bash
# Uploads the APK or AAB of a build that is not published to R2 and puts its link on the run summary. GitHub artifacts
# are not used: the account's artifact storage is 500 MB, and a full quota failed every Android build from 2026-11-03.
# The key holds the run number, so another run never overwrites the file. Reads FILE, ANDROID_ENVIRONMENT,
# VERSION_CODE, BUCKET, R2_PUBLIC_URL and the AWS_* settings for R2.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

name=$(basename "$FILE")
key="android/${ANDROID_ENVIRONMENT#android-}/ci/$VERSION_CODE/$name"
type=application/vnd.android.package-archive
[ "${name##*.}" = aab ] && type=application/octet-stream
aws s3 cp "$FILE" "s3://$BUCKET/$key" --content-type "$type" --content-disposition "attachment; filename=\"$name\""
url="${R2_PUBLIC_URL%/}/$key"
ci_output url "$url"
printf '\n**Download:** [%s](%s)\n\n' "$name" "$url" | ci_summary
