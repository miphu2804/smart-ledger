#!/usr/bin/env bash
# Builds the project for Vercel. Reads VERCEL_TARGET (production or preview); the CLI reads VERCEL_TOKEN from the
# environment itself, because a token argument is visible to every process on the machine through ps.
set -euo pipefail

args=(build)
[ "$VERCEL_TARGET" = production ] && args+=(--prod)
vercel "${args[@]}"
