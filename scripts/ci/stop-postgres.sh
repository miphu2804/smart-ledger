#!/usr/bin/env bash
# Removes the PostgreSQL that start-postgres.sh started for this job.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

docker rm -f "ci-postgres-$SMARTLEDGER_RUN_ID-$SMARTLEDGER_JOB"
