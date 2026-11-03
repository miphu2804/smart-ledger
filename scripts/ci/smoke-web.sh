#!/usr/bin/env bash
# Fails when the deployed web at URL would not reach Core: page down, env not baked in, or Core rejecting this origin's
# CORS preflight. URL is the fixed domain Core CORS lists (staging alias or production domain), never the per-deploy hash
# URL. Reads URL, EXPO_PUBLIC_USE_MOCK and EXPO_PUBLIC_API_ENDPOINT; run from the repository root.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

# A fresh alias can take a few seconds to route, so retry before failing.
for _ in 1 2 3 4 5 6; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/")
  [ "$code" = 200 ] && break
  sleep 5
done
test "$code" = 200
echo "page: 200"
if [ "$EXPO_PUBLIC_USE_MOCK" = "true" ]; then echo "mock build, skipping Core checks"; exit 0; fi
grep -rqF "$EXPO_PUBLIC_API_ENDPOINT" .vercel/output/static
echo "bundle: API endpoint baked in"
allow=$(curl -s -o /dev/null -D - -X OPTIONS "$EXPO_PUBLIC_API_ENDPOINT/api/v1/auth/session" \
  -H "Origin: $URL" -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type" \
  | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}')
if [ "$allow" != "$URL" ]; then ci_error "Core CORS does not allow $URL"; exit 1; fi
echo "cors: Core allows $URL"
