#!/usr/bin/env bash
# Applies the Core Flyway migrations to the empty PostgreSQL that start-postgres.sh started for this job.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

docker run --rm --network "container:${PG_CONTAINER:?start-postgres.sh must run first}" \
  --volume "$repo_root/backend/core/src/main/resources/db/migration:/flyway/sql:ro" \
  flyway/flyway:13.7.0 \
  "-url=jdbc:postgresql://127.0.0.1:5432/smartledger" \
  -user=smartledger \
  -password=smartledger \
  -locations=filesystem:/flyway/sql \
  -connectRetries=10 \
  migrate
