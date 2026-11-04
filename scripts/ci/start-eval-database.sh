#!/usr/bin/env bash
# Starts a throwaway database on a free port (container DB_CONTAINER), migrates it with scripts/local-db.sh and seeds it
# for the agent_chat eval; sets DB_PORT for the later steps. A run never touches a developer's smartledger-local-db on
# the same machine; the eval refuses any database that is not on localhost. Run from the repository root.
set -euo pipefail
. "$(dirname "$0")/lib.sh"

# A ref from before eval-regression has a local-db.sh that ignores LOCAL_DB_*, and would migrate a developer's own
# database on port 54322 of a self-hosted machine.
grep -q LOCAL_DB_PORT scripts/local-db.sh || { ci_error "$SMARTLEDGER_COMMIT predates eval-regression"; exit 1; }
port=$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')
ci_env DB_PORT "$port"
LOCAL_DB_CONTAINER="$DB_CONTAINER" LOCAL_DB_PORT="$port" sh scripts/local-db.sh
# seed.sql gives the shop to the first user; a fresh database has none yet.
docker exec "$DB_CONTAINER" psql -q -U smartledger -d smartledger -v ON_ERROR_STOP=1 \
  -c "INSERT INTO users (display_name) VALUES ('Eval owner')"
docker exec -i "$DB_CONTAINER" psql -q -U smartledger -d smartledger -v ON_ERROR_STOP=1 \
  < backend/ai/evaluation/agent_chat/seed.sql
