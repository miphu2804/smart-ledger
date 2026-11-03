#!/usr/bin/env bash
# Installs the pinned Dopbase CLI into a prefix and data directory under ci_temp_dir, so the machine's own CLI and login
# stay untouched, and puts it on PATH. To upgrade, change the version and the digests from the release page of
# github.com/dopbase/dopbase, as in deploy/dopbase/Dockerfile.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

version=0.1.10
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) target=linux_amd64 sha=b294f56057cb21f5ca22348944ac538ed4d6a751282b342c96761483a3114868 ;;
  Linux-aarch64 | Linux-arm64) target=linux_arm64 sha=6a5c973944ed222d398c0e542a05b6321de706201c56222de652fd85329007f5 ;;
  Darwin-x86_64) target=darwin_amd64 sha=e5947d00175f1690076171af0ad914ac460810426fad8451fe81d22b3ac54055 ;;
  Darwin-arm64) target=darwin_arm64 sha=6bfd33102d4da2b5ec636f716f1e7c997d1dba2b0ce7c023372d163294d35d04 ;;
  *) ci_error "no Dopbase release for $(uname -s)-$(uname -m)"; exit 1 ;;
esac

temp="$(ci_temp_dir)"
archive="$temp/dopbase.tar.gz"
curl -fsSLo "$archive" "https://github.com/dopbase/dopbase/releases/download/$version/dopbase_${version}_$target.tar.gz"
echo "$sha  $archive" | shasum -a 256 -c - >&2
mkdir -p "$temp/dopbase/bin" "$temp/dopbase/data"
tar -xzf "$archive" -C "$temp/dopbase/bin" dopbase
ci_add_path "$temp/dopbase/bin"
ci_env DOPBASE_DATA_DIR "$temp/dopbase/data"
