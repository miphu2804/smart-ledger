#!/usr/bin/env bash
# Decodes ANDROID_KEYSTORE_BASE64 to a file under ci_temp_dir and sets RELEASE_KEYSTORE to its path. Without it the build
# keeps the template's debug keystore, which is public: fine for a test build, never for a published one, so an
# android-production build (ANDROID_ENVIRONMENT) fails instead. The keystore is PKCS12, so the key shares the store
# password.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

if [ -z "${ANDROID_KEYSTORE_BASE64:-}" ]; then
  # A production build signed with the debug key builds green but cannot update the installed app or go to Google Play.
  if [ "${ANDROID_ENVIRONMENT:-}" = android-production ]; then
    ci_error "android-production needs ANDROID_KEYSTORE_BASE64 from Dopbase release/production; refusing to sign with the debug keystore"
    exit 1
  fi
  echo "No release keystore in this environment: signing with the debug keystore."
  exit 0
fi
file="$(ci_temp_dir)/release.keystore"
printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$file"
ci_env RELEASE_KEYSTORE "$file"
