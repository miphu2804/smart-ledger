#!/usr/bin/env bash
# Builds the project for Vercel. Reads VERCEL_TARGET (production or preview) and VERCEL_TOKEN.
set -euo pipefail

args=(--token="$VERCEL_TOKEN")
[ "$VERCEL_TARGET" = production ] && args+=(--prod)
vercel build "${args[@]}"
