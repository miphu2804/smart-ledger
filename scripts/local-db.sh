#!/bin/sh
# Starts the PostgreSQL that secrets/local.env.core and secrets/local.env.ai point at, and brings its schema up to date:
# Core's Flyway migrations first, because the AI read views select from Core's tables, then the AI migrations in
# supabase/migrations, then the ai_reader login behind AI_SQL_READER_URL. Every step is safe to re-run.
# Data stays in the smartledger-local-db volume; `docker rm -f smartledger-local-db && docker volume rm smartledger-local-db` starts over.
cd "$(git rev-parse --show-toplevel)" || exit 1
set -e
container=smartledger-local-db

if ! docker start "$container" >/dev/null 2>&1; then
  docker run -d --name "$container" -p 127.0.0.1:54322:5432 -v "$container:/var/lib/postgresql/data" \
    -e POSTGRES_DB=smartledger -e POSTGRES_USER=smartledger -e POSTGRES_PASSWORD=smartledger pgvector/pgvector:pg17 >/dev/null
fi
until docker exec "$container" pg_isready -U smartledger -d smartledger >/dev/null 2>&1; do sleep 1; done

# The same Flyway version as Core, so Core starting later with FLYWAY_ENABLED=true finds nothing to change.
docker run --rm --network "container:$container" -v "$PWD/backend/core/src/main/resources/db/migration:/flyway/sql:ro" \
  flyway/flyway:11.7.2 -url=jdbc:postgresql://127.0.0.1:5432/smartledger -user=smartledger -password=smartledger -q migrate
npx --yes supabase@2.119.0 db push --yes --db-url postgresql://smartledger:smartledger@127.0.0.1:54322/smartledger
docker exec "$container" psql -q -U smartledger -d smartledger -c "
  DO \$\$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ai_reader') THEN CREATE ROLE ai_reader LOGIN PASSWORD 'ai_reader'; END IF;
  END \$\$;
  GRANT ai_sql_reader TO ai_reader;"
echo "local-db: ready at 127.0.0.1:54322; run scripts/secrets/apply.sh staging dev --apply to point Core and AI at it"
