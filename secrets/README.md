# secrets

Local copies of the team's env files, one folder per environment, pulled from Dopbase. Only `staging/targets`, `templates/` and `local.env.*` are in git; every `env/` folder is ignored. The full guide, file format and what each file holds: [Secrets and env files](../docs/development/secrets-and-env.md).

## Where a credential lives

| What | Where | In git |
|---|---|---|
| Values (passwords, tokens, keys) | Dopbase, `https://secrets.songheloi.id.vn`, one project per service and one environment per stage | no |
| Groups and comments of each file | `templates/.env.<name>`, no values | yes |
| Local database keys for a dev machine | `local.env.core`, `local.env.ai`, public defaults of `scripts/local-db.sh` | yes |
| Files `apply.sh` copies to a fixed path | `staging/targets` | yes |
| Pulled copies | `<environment>/env/` | no |
| Variable names for people without Dopbase | `.env.example` beside each app | yes |

Never commit a value, paste one into a PR, or edit a pulled file to change it: a pull replaces it. Change the value in Dopbase.

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
| Get the latest staging or production secrets | `scripts/secrets/dopbase-sync.sh pull staging` or `pull production` |
| See what would change in `backend/core/.env`, `backend/ai/.env`, `frontend/mobile/.env` and the other targets | `scripts/secrets/apply.sh staging dev` |
| Write those files with the local database keys from `local.env.*`, keeping the old ones as `.bak` | `scripts/secrets/apply.sh staging dev --apply` |
| Change a secret | Dopbase web UI, or `dopbase secret set <project>/<environment> KEY`, then pull |
| Add a new key | Set it in Dopbase for every environment that needs it, add `KEY=` to its group in `templates/`, then pull |
| Find keys missing from a template | `scripts/secrets/check-templates.sh` |
| See who changed a key | `dopbase secret history <project>/<environment> <KEY>` |
| Run the backend | `docker compose --env-file backend/core/.env --env-file backend/ai/.env up --build` |

Copying to a dev machine runs from staging only. Production is pulled for reading by the deploy tools and is never copied to a dev machine.
