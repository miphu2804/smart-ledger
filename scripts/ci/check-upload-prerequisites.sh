#!/usr/bin/env bash
# Fails before the build, which takes minutes, instead of at the upload, when a setting is missing. Every build goes to
# R2 (scripts/ci/upload-build.sh), and a publish also needs the release keystore. Reads ANDROID_ENVIRONMENT, PUBLISH
# (true|false) and the settings named below.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

names="R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET R2_PUBLIC_URL"
[ "$PUBLISH" = true ] && names="$names ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD"
missing=""
for name in $names; do
  [ -n "${!name:-}" ] || missing="$missing $name"
done
if [ -n "$missing" ]; then
  ci_error "Environment $ANDROID_ENVIRONMENT needs:$missing (see docs/development/ci-cd.md#android-build)"; exit 1
fi
command -v aws > /dev/null || { ci_error "Uploading to R2 needs the aws CLI on this runner."; exit 1; }
