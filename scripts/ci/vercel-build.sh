#!/usr/bin/env bash
# Builds the project for Vercel. Reads VERCEL_TARGET (production or preview) and VERCEL_TOKEN.
set -euo pipefail

if [ "$VERCEL_TARGET" = production ]; then
  vercel build --prod --token="$VERCEL_TOKEN"
else
  vercel build --token="$VERCEL_TOKEN"
fi
