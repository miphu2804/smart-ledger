#!/usr/bin/env bash
# Usage: build-image.sh <ai|core> <image>
# Builds the service image for SMARTLEDGER_COMMIT and pushes it to <image>. Reads SMARTLEDGER_IMAGE_SOURCE, the
# repository URL that the label links the package to, which lets the pushing token delete its versions later.
# The VPS is linux/amd64 while a self-hosted machine may be arm64, so every image names its platform. Without provenance
# each push is one tagged version, so the cleanup counts only deployable images.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

service="${1:?usage: build-image.sh <ai|core> <image>}"
image="${2:?usage: build-image.sh <ai|core> <image>}"
build() { docker buildx build --platform linux/amd64 --provenance=false --label "org.opencontainers.image.source=$SMARTLEDGER_IMAGE_SOURCE" "$@"; }

case "$service" in
  ai)
    build --build-arg "GIT_SHA=$SMARTLEDGER_COMMIT" --tag "$image" --push "$repo_root/backend/ai"
    ;;
  core)
    # The runner builds the jar and the image only wraps it in a JRE, so the image build needs no Maven.
    cd "$repo_root/backend/core"
    bash ./mvnw --batch-mode --no-transfer-progress -DskipTests package
    prebuilt="$(ci_temp_dir)/core-prebuilt"
    mkdir -p "$prebuilt"
    cp target/core-0.0.1-SNAPSHOT.jar "$prebuilt/app.jar"
    build --file Dockerfile.prebuilt --tag "$image" --push "$prebuilt"
    ;;
  *) echo "usage: build-image.sh <ai|core> <image>" >&2; exit 2 ;;
esac
