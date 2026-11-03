#!/usr/bin/env bash
# Points TMPDIR at the job's own temp directory. Metro caches transformed modules (with EXPO_PUBLIC_* inlined) under
# TMPDIR; on a shared machine the mock build of mobile-web would otherwise leak into the real bundle of deploy-web.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

ci_env TMPDIR "$(ci_temp_dir)"
