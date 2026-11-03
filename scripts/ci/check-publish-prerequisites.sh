#!/usr/bin/env bash
# Fails before the build, which takes minutes, instead of at the upload, when a publish lacks a setting. Reads
# ANDROID_ENVIRONMENT and the settings named below.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

missing=""
for name in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET R2_PUBLIC_URL ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD; do
  [ -n "${!name:-}" ] || missing="$missing $name"
done
if [ -n "$missing" ]; then
  ci_error "Publishing needs these in environment $ANDROID_ENVIRONMENT:$missing"; exit 1
fi
command -v aws > /dev/null || { ci_error "Publishing needs the aws CLI on this runner."; exit 1; }
