#!/usr/bin/env bash
# Decodes ANDROID_KEYSTORE_BASE64 to a file under ci_temp_dir and sets RELEASE_KEYSTORE to its path. Without it the build
# keeps the template's debug keystore, which is public: fine for a test build, never for a published one. The keystore
# is PKCS12, so the key shares the store password.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

[ -n "${ANDROID_KEYSTORE_BASE64:-}" ] || { echo "No release keystore in this environment: signing with the debug keystore."; exit 0; }
file="$(ci_temp_dir)/release.keystore"
printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$file"
ci_env RELEASE_KEYSTORE "$file"
