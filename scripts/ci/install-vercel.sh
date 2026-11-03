#!/usr/bin/env bash
# Installs the pinned Vercel CLI into a job-local prefix under ci_temp_dir and puts it on PATH, so the self-hosted
# machine's own CLI (e.g. Homebrew's) is neither clashed with nor replaced.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

prefix="$(ci_temp_dir)/cli"
npm install --prefix "$prefix" vercel@62.2.0 >&2
ci_add_path "$prefix/node_modules/.bin"
