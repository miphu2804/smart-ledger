#!/usr/bin/env bash
# Fails unless the deployed landing at URL answers 200 and, when VITE_ADMIN_ENABLED=true, serves the admin login and Core
# accepts the landing's origin. Reads URL (the fixed LANDING_URL), VITE_ADMIN_ENABLED and VITE_API_ENDPOINT.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

test -n "$URL" || { ci_error "LANDING_URL is not set for this environment"; exit 1; }
# A fresh alias can take a few seconds to route, so retry before failing.
for _ in 1 2 3 4 5 6; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/" || true)
  [ "$code" = 200 ] && break
  sleep 5
done
test "$code" = 200
echo "page: 200 at $URL"
if [ "$VITE_ADMIN_ENABLED" = true ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/admin/login" || true)
  test "$code" = 200 || { ci_error "admin login page returned $code"; exit 1; }
  echo "admin login page: 200 at $URL/admin/login"
  # The browser calls Core from this origin, so the admin is unusable until Core allows it. Core may still be
  # deploying a new CORS_ALLOWED_ORIGINS in the same run (job `deploy`), so wait up to 5 minutes, then fail.
  for _ in $(seq 1 20); do
    cors=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$VITE_API_ENDPOINT/api/v1/me" \
      -H "Origin: $URL" -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization' || true)
    [ "$cors" = 200 ] && break
    sleep 15
  done
  if [ "$cors" != 200 ]; then
    ci_error "Core at $VITE_API_ENDPOINT still answers $cors to a CORS preflight from $URL after 5 minutes; add $URL to CORS_ALLOWED_ORIGINS of the matching backend-* environment and redeploy Core"
    exit 1
  fi
  echo "Core accepts $URL (CORS)"
fi
