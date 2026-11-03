#!/usr/bin/env bash
# Builds the Android app with scripts/release/android-release.sh, which does what a local build does (npm ci, expo
# prebuild --clean, Gradle, APK report), and sets the output path to the file it wrote under ci_temp_dir. Reads FORMAT
# (apk|aab), ABIS, ANDROID_ENVIRONMENT, SMARTLEDGER_REF and SMARTLEDGER_COMMIT, plus what android-release.sh reads.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

branch=$(echo "$SMARTLEDGER_REF" | tr -c 'A-Za-z0-9\n' '-')
out="$(ci_temp_dir)/android-out/smart-ledger-${ANDROID_ENVIRONMENT#android-}-${branch}-${SMARTLEDGER_COMMIT::7}.$FORMAT"
args=(--abis "$ABIS" --out "$out")
[ "$FORMAT" = aab ] && args+=(--aab)
"$repo_root/scripts/release/android-release.sh" "${args[@]}"
ci_output path "$out"
