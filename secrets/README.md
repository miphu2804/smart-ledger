# secrets

Local copies of the team's env files, one folder per environment, pulled from Dopbase. Only `staging/targets` and `local.env.*` are in git; every `env/` folder is ignored. How it works, the file format and what each file holds: [Secrets and env files](../docs/development/secrets-and-env.md).

## Set up once

```bash
dopbase client connect https://secrets.songheloi.id.vn
dopbase login
scripts/secrets/dopbase-sync.sh pull staging
scripts/local-db.sh
scripts/secrets/apply.sh staging dev --apply
```

## Use

| Task | Command |
|---|---|
| Get the latest secrets | `scripts/secrets/dopbase-sync.sh pull staging` |
| See what would change in `backend/core/.env`, `backend/ai/.env`, `frontend/mobile/.env` | `scripts/secrets/apply.sh staging dev` |
| Write those files with the local database keys from `local.env.*`, keeping the old ones as `.bak` | `scripts/secrets/apply.sh staging dev --apply` |
| Change a secret | Dopbase web UI, or edit `staging/env/` and run `scripts/secrets/dopbase-sync.sh push staging` |
| See who changed a key | `dopbase secret history <project>/staging <KEY>` |
| Run the backend | `docker compose --env-file backend/core/.env --env-file backend/ai/.env up --build` |
