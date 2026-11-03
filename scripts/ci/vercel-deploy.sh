#!/usr/bin/env bash
# Uploads the build of vercel-build.sh and sets the output url to the deployment's URL. Reads VERCEL_TARGET
# (production or preview) and VERCEL_TOKEN.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

if [ "$VERCEL_TARGET" = production ]; then
  url=$(vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN")
else
  url=$(vercel deploy --prebuilt --token="$VERCEL_TOKEN")
fi
ci_output url "$url"
