#!/usr/bin/env bash
# Uploads the build of vercel-build.sh and sets the output url to the deployment's URL. Reads VERCEL_TARGET
# (production or preview) and VERCEL_TOKEN.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

args=(--prebuilt --token="$VERCEL_TOKEN")
[ "$VERCEL_TARGET" = production ] && args+=(--prod)
url=$(vercel deploy "${args[@]}")
ci_output url "$url"
