#!/usr/bin/env bash
# Writes ANDROID_GOOGLE_SERVICES_JSON to a file under ci_temp_dir and sets GOOGLE_SERVICES_JSON to its path, which
# app.config.js reads. The file is gitignored (public repo), so it never lands in the workspace.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

if [ -z "$ANDROID_GOOGLE_SERVICES_JSON" ]; then
  ci_error "Secret ANDROID_GOOGLE_SERVICES_JSON is empty in environment $ANDROID_ENVIRONMENT."; exit 1
fi
file="$(ci_temp_dir)/google-services.json"
printf '%s' "$ANDROID_GOOGLE_SERVICES_JSON" > "$file"
ci_env GOOGLE_SERVICES_JSON "$file"
