#!/usr/bin/env bash
# Sets EXPO_PUBLIC_STT_MODEL_URL for the later steps. The model is not in git, so the APK downloads it from R2 on first
# use. A publish (PUBLISH=true) uploads the version named in core.ts when R2 lacks it (only missing or wrong-size
# files, so a released version is never rewritten); other builds only warn, as voice input then cannot work. Reads STT_MODEL_BASE_URL, BUCKET and the AWS_* settings for R2. Run from the repository
# root.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

if [ -z "$STT_MODEL_BASE_URL" ]; then
  [ "$PUBLISH" = true ] && { ci_error "Publishing needs variable STT_MODEL_BASE_URL."; exit 1; }
  ci_warning "STT_MODEL_BASE_URL is not set: voice input in this build cannot download its model."; exit 0
fi
if ! line=$(node .github/scripts/stt-model.mjs check); then
  if [ "$PUBLISH" != true ]; then
    echo "${line//::error::/::warning::}"
    ci_warning "Voice input in this build cannot download its model; a publish uploads it."; exit 0
  fi
  echo "${line//::error::/::notice::}"
  dir="$(ci_temp_dir)/stt-model"
  version=$(node .github/scripts/stt-model.mjs fetch "$dir") || { echo "$version"; exit 1; }
  aws s3 sync "$dir" "s3://$BUCKET/stt-model/$version/" --size-only
  rm -rf "$dir"
  line=$(node .github/scripts/stt-model.mjs check) || { echo "$line"; exit 1; }
fi
echo "$line"
ci_env "${line%%=*}" "${line#*=}"
