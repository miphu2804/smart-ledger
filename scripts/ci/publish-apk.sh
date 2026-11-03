#!/usr/bin/env bash
# Publishes the release-signed APK (APK) to R2: builds/ keeps every published APK for rollback; latest.apk is the fixed
# URL the landing page links to. Reads APK, BUCKET, VERSION_CODE, R2_PUBLIC_URL, ANDROID_BUILD_TOOLS, ANDROID_HOME (or
# ANDROID_SDK_ROOT) and the AWS_* settings for R2.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

# Anyone can sign an update with the debug key, so a debug-signed APK must never reach the download link.
sdk="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
certs=$("$sdk/build-tools/$ANDROID_BUILD_TOOLS/apksigner" verify --print-certs "$APK")
echo "$certs"
if echo "$certs" | grep -q "CN=Android Debug"; then
  ci_error "The APK is signed with the debug keystore; not publishing."; exit 1
fi
prefix="s3://$BUCKET/android/production"
type=application/vnd.android.package-archive
aws s3 cp "$APK" "$prefix/builds/$(basename "$APK")" --content-type "$type"
aws s3 cp "$APK" "$prefix/latest.apk" --content-type "$type" --cache-control no-cache \
  --content-disposition 'attachment; filename="so-nghe-loi.apk"'
# Last, so a phone never reads a manifest whose APK is not uploaded yet. Installed apps compare versionCode with this
# file (frontend/mobile/src/lib/appUpdate.ts) and offer the APK in builds/, which is never overwritten.
version_json="$(ci_temp_dir)/version.json"
# shellcheck disable=SC2016 # the JavaScript template literal must reach node unexpanded
BASE="${R2_PUBLIC_URL%/}" node -e 'const { expo } = require(process.argv[1]);
  console.log(JSON.stringify({ versionCode: Number(process.env.VERSION_CODE), versionName: expo.version,
    apk: `${process.env.BASE}/android/production/builds/${require("path").basename(process.env.APK)}` }))' \
  "$repo_root/frontend/mobile/app.json" > "$version_json"
cat "$version_json"
aws s3 cp "$version_json" "$prefix/version.json" --content-type application/json --cache-control no-cache
