# Secrets and env files

Every credential the team shares (local `.env` files, VPS service env files, GitHub Actions variables) lives in Dopbase, the team's secrets manager at `https://secrets.songheloi.id.vn` ([setup](ci-cd.md)). Each env file is one Dopbase project and each environment is a Dopbase environment of that project. `scripts/secrets/dopbase-sync.sh pull <environment>` writes them into `secrets/<environment>/env/`, which git ignores; tools read most files there directly, and `scripts/secrets/apply.sh staging dev` copies the few that a tool reads at a fixed path, pointing them at a local database.

## 1. Layout

```text
smart-ledger/
├── secrets/
│   ├── staging/
│   │   ├── env/               # pulled from Dopbase, one per service; ignored
│   │   │   ├── .env.ai
│   │   │   ├── .env.core
│   │   │   ├── ...
│   │   │   └── github/        # one per GitHub Actions environment
│   │   └── targets            # files apply.sh writes; in git
│   ├── production/
│   │   └── env/               # pulled from Dopbase; ignored
│   ├── templates/             # groups and comments of every env file, no values; in git
│   └── local.env.core, local.env.ai   # local database keys apply.sh puts over staging; in git
└── scripts/secrets/
    ├── dopbase-sync.sh        # Dopbase <-> env/
    ├── check-templates.sh     # templates vs Dopbase and the .env.example files
    ├── apply.sh               # staging env/ -> backend/core/.env and the other targets
    ├── github.sh              # env/ -> GitHub Actions secrets
    └── lib.sh                 # helpers
```

A file maps to a project by its name: `env/.env.core` is `core/<environment>` and a GitHub environment file `env/github/.env.<service>-<stage>` is `github-<service>/<stage>`, so `.env.vercel-staging` is `github-vercel/staging` and `.env.android-dev` (kept in the staging folder) is `github-android/dev`. A file whose name holds `.` or `_` cannot be a Dopbase project and is skipped.

## 2. Env file format

Dopbase stores only `KEY=value`, so the groups and comments below live in `secrets/templates/.env.<name>` (`secrets/templates/github/.env.<service>` for a GitHub environment, shared by its stages). `dopbase-sync.sh pull` lays each export out by its template, so staging, production and the copies `apply.sh` writes all keep the same format. A template holds every key of every environment of its project with empty values, and a group none of whose keys an environment holds is left out of that environment's file. A key Dopbase has and its template lacks lands under `### Ungrouped ###` and is named on stderr; add it to the template, and run `scripts/secrets/check-templates.sh` to find such keys without pulling. Each file's first line names it; keys are grouped:

```
# Core for local development

### Database ###
DATABASE_URL=...
DATABASE_USERNAME=...

### Zalo ###
# Explanation of the group, when it needs one.
ZALO_APP_ID=...
```

| Line | Meaning |
|---|---|
| `# <title>` | First line: what the file is for |
| `## <section> ##` | Only in `github/`: starts the Variables or the Secrets section, which hold groups |
| `### <group> ###` | Starts a group of related keys |
| `# <text>` | Explanation for the group or key below it |
| one blank line | Between groups |

### 2.1 What each environment holds

| File in `env/` | Used by | staging | production |
|---|---|---|---|
| `.env.core`, `.env.ai` | Core and AI: the env files the Ansible playbook uploads to the VPS, plus settings left at their code default; staging copies go to `backend/core/.env` and `backend/ai/.env` with `local.env.*` put over them | yes | yes (read in place) |
| `.env.bifrost` | Bifrost model gateway: the provider key and the virtual key AI uses, uploaded to the VPS as `bifrost.env` ([CI/CD](ci-cd.md#service-variables)) | yes | yes |
| `.env.mobile` | mobile app; copied to `frontend/mobile/.env` | yes | no |
| `.env.release` | Android APK release: R2 bucket, keystore | no | yes |
| `.env.loadtest`, `.env.monitor` | load test and uptime monitor; staging copies go to `scripts/loadtest/.env.staging` and `scripts/monitor/.env`. `GRAFANA_PG_*` in `.env.monitor` is also the read-only `grafana_reader` login of the product dashboard, which `vps-playbook.sh` loads ([CI/CD](ci-cd.md#monitoring)); production holds only this login | yes | `.env.loadtest`, and `.env.monitor` with `GRAFANA_PG_*` only |
| `.env.vps` | the VPS of that environment: `VPS_HOST`, `VPS_KNOWN_HOSTS`, the CI deploy key (`VPS_SSH_KEY` in base64, `VPS_SSH_PUBLIC_KEY`), `CLOUDFLARE_TUNNEL_TOKEN` and, for [monitoring](ci-cd.md#monitoring), `MONITOR_DOMAIN`, `GRAFANA_ADMIN_PASSWORD`, `MONITOR_DISCORD_WEBHOOK_URL`, `MONITOR_TELEGRAM_BOT_TOKEN` and `MONITOR_TELEGRAM_CHAT_ID`; read by the Ansible playbook and `github.sh` ([VPS](ci-cd.md#vps)) | yes | yes |
| `github/.env.<environment>` | copy of a GitHub Actions environment | 4 environments | 3 environments |

Files are named `.env.<name>`, like `.env.local` and `.env.production` in Next.js; the folder already says which environment they belong to. `targets` lists the copied files. Everything else is read in place, for example `docker compose --env-file secrets/production/env/.env.core --env-file secrets/production/env/.env.ai`, so there is no second copy to drift.

`.env.core` and `.env.ai` hold plain values that can be read anywhere; `LOGFIRE_SERVICE_VERSION` is left out because every deploy sets it to the commit. `github/.env.*` have two sections, `## Variables ##` and `## Secrets (write-only in GitHub, values not pulled) ##`, each grouped by topic like the other files. Secrets are listed as `# NAME` lines, by name only, because GitHub never returns a secret's value.

Not in `secrets/`: `.env.example` files (committed templates), and generated files such as `supabase/.temp` and `frontend/mobile/ios/.xcode.env`.

## 3. Set up a machine

1. Install the Dopbase CLI from the release page of `github.com/dopbase/dopbase`, then connect it and log in with the account the maintainer created for you:

   ```bash
   dopbase client connect https://secrets.songheloi.id.vn
   dopbase login
   ```

2. Pull staging, start the local database and write the service env files:

   ```bash
   scripts/secrets/dopbase-sync.sh pull staging
   scripts/local-db.sh
   scripts/secrets/apply.sh staging dev --apply
   ```

   `scripts/local-db.sh` runs PostgreSQL with pgvector in Docker at `127.0.0.1:54322`, applies Core's Flyway migrations, then the AI migrations in `supabase/migrations`, and creates the read-only `ai_reader` login. Every step is safe to re-run, and data stays in the `smartledger-local-db` volume.

## 4. Daily use

- `scripts/secrets/dopbase-sync.sh pull <environment>` replaces each file in `secrets/<environment>/env/` with its Dopbase project. It asks for your Dopbase password once and types it into the confirmation of every export with `expect`; a failed export leaves that file as it was.
- `scripts/secrets/apply.sh staging dev` is a dry run: per file in `targets` it builds the staging file with the keys of `secrets/local.<name>` (the local database) put over it, and lists keys that would be added (`+`), changed (`~`) or dropped (`-`), or `(comments or layout only)`. Values are never printed. `--use-staging KEY` keeps the staging value of one local key, for example to reach the shared staging database.
- `scripts/secrets/apply.sh staging dev --apply` writes the files and keeps each replaced one as `<file>.bak` (`--no-backup` skips it). A key you added only on your machine shows as `-` and is lost on apply; add it to Dopbase first.
- Copying runs one way, from staging to this machine, and copying to or from production is not supported.
- Dopbase keeps the history of every secret: `dopbase secret history <project>/<environment> <KEY>` and `dopbase secret rollback`.

## 5. Change a secret

Change it in the Dopbase web UI or with `dopbase secret set <project>/<environment> KEY=value`, then pull. Dopbase is the only place to change a value: the backend deploy reads `core` and `ai` from it, and `scripts/secrets/vps-playbook.sh` reads every VPS file from it, so an edit in `secrets/<environment>/env/` reaches nothing. For a new service, write its file and run `scripts/secrets/dopbase-sync.sh seed <environment>`, which loads only files whose Dopbase environment does not exist yet; every value must stay on its key's line.

## 6. Add or remove a person

The maintainer creates or removes the person's Dopbase account and grants access per project. When someone leaves, rotate every secret they could read, because they may still hold a pulled copy.
