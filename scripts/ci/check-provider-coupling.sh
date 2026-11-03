#!/usr/bin/env bash
# Fails when a file under scripts/ or deploy/ names GitHub's variables or expression syntax, so that every script runs on
# another CI provider or a laptop by changing scripts/ci/lib.sh alone. scripts/secrets/github.sh syncs GitHub secrets and
# is GitHub-specific by purpose. Run from anywhere; searches the tracked files.
set -euo pipefail

cd "$(dirname "$0")/../.."
found=$(git grep -nE 'GITHUB_|\$\{\{' -- scripts deploy ':!scripts/ci/lib.sh' ':!scripts/secrets/github.sh' ':!scripts/ci/check-provider-coupling.sh' || true)
if [ -n "$found" ]; then
  echo "Provider-specific names outside scripts/ci/lib.sh; read them through lib.sh and the SMARTLEDGER_* variables:" >&2
  echo "$found" >&2
  exit 1
fi
echo "No GITHUB_ or \${{ }} outside scripts/ci/lib.sh."
