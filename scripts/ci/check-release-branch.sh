#!/usr/bin/env bash
# Fails unless the branch matches the Android environment. Reads ANDROID_ENVIRONMENT (android-dev, android-staging or
# android-production), PUBLISH (true|false), SMARTLEDGER_REF and SMARTLEDGER_REF_TYPE. Any other branch of this
# repository builds as android-dev, so a pull request can be tested before it merges.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

if [ "$SMARTLEDGER_REF_TYPE" != branch ]; then
  ci_error "Run this workflow from a branch, not a tag."; exit 1
fi
# The branch decides the environment, so main can never be built with staging or dev config.
case "$SMARTLEDGER_REF" in
  main) want=android-production ;;
  staging) want=android-staging ;;
  *) want=android-dev ;;
esac
if [ "$ANDROID_ENVIRONMENT" != "$want" ]; then
  ci_error "Branch $SMARTLEDGER_REF builds only with $want, got $ANDROID_ENVIRONMENT."; exit 1
fi
# The landing page links to one file, and it must be the build that talks to the production backend.
if [ "$PUBLISH" = true ] && [ "$ANDROID_ENVIRONMENT" != android-production ]; then
  ci_error "publish is only allowed with android-production, got $ANDROID_ENVIRONMENT."; exit 1
fi
