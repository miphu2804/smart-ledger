#!/usr/bin/env bash
# Sets the outputs format (apk|aab) and abis for the Android environment, and starts the TIMINGS file that
# scripts/release/android-release.sh and .github/scripts/android-summary.mjs add phase marks to. Reads
# ANDROID_ENVIRONMENT and PUBLISH (true|false).
set -euo pipefail
. "$(dirname "$0")/lib.sh"

# Staging and production carry the two ARM ABIs that phones use: arm64 for current phones and Apple Silicon emulators,
# armeabi-v7a for old 32-bit phones. x86 and x86_64 only served Intel emulators and added about 20 MB each to the APK.
# Dev stays arm64-only for a fast build on a real phone. A published production build is an APK because people install
# it straight from the landing page.
production_format=aab
[ "$PUBLISH" = true ] && production_format=apk
case "$ANDROID_ENVIRONMENT" in
  android-production) ci_output format "$production_format"; ci_output abis armeabi-v7a,arm64-v8a ;;
  android-staging) ci_output format apk; ci_output abis armeabi-v7a,arm64-v8a ;;
  *) ci_output format apk; ci_output abis arm64-v8a ;;
esac
timings="$(ci_temp_dir)/timings.txt"
ci_env TIMINGS "$timings"
echo "start=$(date +%s)" > "$timings"
