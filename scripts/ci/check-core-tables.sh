#!/usr/bin/env bash
# Fails unless the PostgreSQL container holds the three tables every Core feature starts from.
set -euo pipefail

table_count="$(docker exec -e PGPASSWORD=smartledger "${PG_CONTAINER:?start-postgres.sh must run first}" \
  psql -h 127.0.0.1 -p 5432 -U smartledger -d smartledger -Atc \
  "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('users', 'auth_identities', 'shops')")"
test "$table_count" = "3"
