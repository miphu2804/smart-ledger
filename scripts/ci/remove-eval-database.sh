#!/usr/bin/env bash
# Removes the throwaway eval database (container and volume DB_CONTAINER) and the ai.env with the AI settings.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

docker rm -f -v "$DB_CONTAINER" > /dev/null 2>&1 || true
docker volume rm "$DB_CONTAINER" > /dev/null 2>&1 || true
rm -f "$(ci_temp_dir)/ai.env"
