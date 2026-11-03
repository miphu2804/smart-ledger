#!/usr/bin/env bash
# Usage: start-postgres.sh <image> <database>
# Starts a throwaway PostgreSQL (user and password smartledger) on a free local port and sets PG_PORT for the later
# steps. Started with docker rather than as a service container, so one path serves GitHub-hosted and self-hosted
# machines, which cannot run service containers.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

image="${1:?usage: start-postgres.sh <image> <database>}"
database="${2:?usage: start-postgres.sh <image> <database>}"

# A per-job name and a free host port, so jobs running side by side on one machine do not collide. The readiness check
# uses TCP: while initialising, the image runs a temporary server on its Unix socket only.
name="ci-postgres-$SMARTLEDGER_RUN_ID-$SMARTLEDGER_JOB"
docker rm -f "$name" > /dev/null 2>&1 || true
docker run -d --name "$name" -p 127.0.0.1::5432 \
  -e POSTGRES_DB="$database" -e POSTGRES_USER=smartledger -e POSTGRES_PASSWORD=smartledger "$image" >&2
until docker exec "$name" pg_isready -h 127.0.0.1 -U smartledger -d "$database" > /dev/null 2>&1; do sleep 1; done
ci_env PG_PORT "$(docker port "$name" 5432/tcp | head -1 | sed 's/.*://')"
