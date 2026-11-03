#!/usr/bin/env bash
# Fails unless the landing build in .vercel/output matches the environment's admin setting. Admin follows the deploy
# environment only: without VITE_ADMIN_ENABLED=true there must be no admin code (a value set in the Vercel project would
# otherwise slip in through `vercel pull`); with it, the admin must be the real one. Reads VITE_ADMIN_ENABLED,
# VITE_API_ENDPOINT and VITE_FIREBASE_API_KEY.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

out=.vercel/output/static
has_admin=$([ -n "$(find "$out" -name 'AdminRoutes-*')" ] && echo yes || echo no)
# admin123 is a mock demo password; it must never be published
if grep -rqF admin123 "$out"; then
  ci_error "mock demo accounts are in the build; VITE_USE_MOCK must stay false"; exit 1
fi
if [ "$VITE_ADMIN_ENABLED" = true ]; then
  [ "$has_admin" = yes ] || { ci_error "VITE_ADMIN_ENABLED=true but the admin routes are missing"; exit 1; }
  [ -n "$VITE_API_ENDPOINT" ] && [ -n "$VITE_FIREBASE_API_KEY" ] \
    || { ci_error "set VITE_API_ENDPOINT and VITE_FIREBASE_API_KEY on this environment for the admin"; exit 1; }
  grep -rqF "$VITE_API_ENDPOINT" "$out" || { ci_error "the admin does not point at VITE_API_ENDPOINT"; exit 1; }
elif [ "$has_admin" = yes ]; then
  ci_error "admin code is in the landing build; remove VITE_ADMIN_ENABLED from the Vercel project"; exit 1
fi
