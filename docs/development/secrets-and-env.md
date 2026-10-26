# Secrets and env files

Every credential the team shares (local `.env` files, Railway service variables, GitHub Actions variables) is kept as one folder of env files per environment. Git holds a small pointer to each folder, R2 holds the encrypted files, and age decides who can read them. `git pull` brings a new version into `secrets/<environment>/env/`; tools read most files there directly, and `scripts/secrets/apply.sh` copies the few that a tool reads at a fixed path.

## Layout

```
secrets/
  staging/
    env/             decrypted env files, one per service, plus github/ with one per GitHub environment (git-ignored)
    env.age/         the same files encrypted, stored in R2 bucket smart-ledger-staging-creds (git-ignored)
    env.age.dvc      DVC pointer: md5, size and R2 remote of env.age/ (in git)
    recipients.txt   age public keys allowed to decrypt staging (in git)
    targets          env files apply.sh copies out of env/, and where to (in git)
  production/        the same for production, R2 bucket smart-ledger-production-creds; no targets
scripts/secrets/
  pull.sh            DVC pull and age decrypt into env/; runs after git pull and git checkout
  push.sh            age encrypt env/ and DVC push; run after changing a secret
  apply.sh           dry run of the key changes in the targets, or --apply to write them
  guard.sh           pre-commit check that keeps env files and ciphertext out of git
```

- **git** records which version of each folder a commit uses. It never holds a secret, not even the ciphertext. `git checkout <rev> -- secrets/staging/env.age.dvc` followed by `pull.sh` restores that version.
- **R2** stores the ciphertext. A leaked bucket exposes nothing without an age private key.
- **age** encrypts every file once for every public key in `recipients.txt`; any one matching private key decrypts it. A recipient is a public key, so committing `recipients.txt` is safe, like `authorized_keys`.
- Dev machines get only `staging/`. Only people in `production/recipients.txt` with the production R2 token can read production.

## Env file format

Each file in `env/` is one env file. Its first line names it; keys are grouped:

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
| `### <group> ###` | Starts a group of related keys |
| `# <text>` | Explanation for the group or key below it |
| one blank line | Between groups |

### What each environment holds

| File in `env/` | Used by | staging | production |
|---|---|---|---|
| `.env.core`, `.env.ai` | Core and AI, also the two `docker compose --env-file` files; staging copies go to `backend/core/.env` and `backend/ai/.env` | yes | yes (read in place) |
| `.env.mobile` | mobile app; copied to `frontend/mobile/.env` | yes | no |
| `.env.release` | Android APK release: R2 bucket, keystore | no | yes |
| `.env.loadtest`, `.env.monitor` | load test and uptime monitor | yes | loadtest only |
| `.env.railway.core`, `.env.railway.ai` | copy of the Railway service variables | yes | yes |
| `.env.railway.tokens` | Railway API tokens for CD | no | yes |
| `github/.env.<environment>` | copy of a GitHub Actions environment | 7 environments | 4 environments |

Files are named `.env.<name>`, like `.env.local` and `.env.production` in Next.js; the folder already says which environment they belong to. `targets` lists the copied files. Everything else is read in place, for example `docker compose --env-file secrets/production/env/.env.core --env-file secrets/production/env/.env.ai`, so there is no second copy to drift.

`.env.railway.*` keep Railway's own reference syntax (`${{core.DATABASE_PASSWORD}}`) where Railway uses it. `github/.env.*` hold the environment's variables; its secrets are listed by name only, because GitHub never returns a secret's value.

Not in `secrets/`: `.env.r2.secrets` (the R2 tokens DVC needs to reach the files), `.env.example` files (committed templates), and generated files such as `supabase/.temp` and `frontend/mobile/ios/.xcode.env`.

## Set up a machine

1. Install the tools and the git hooks:

   ```bash
   brew install age dvc
   pre-commit install --hook-type pre-commit --hook-type post-merge --hook-type post-checkout
   ```

2. Create an age key and send the public key (the `age1...` line it prints) to whoever maintains the secrets:

   ```bash
   mkdir -p ~/.config/smartledger && age-keygen -o ~/.config/smartledger/age.key && chmod 600 ~/.config/smartledger/age.key
   ```

   An existing SSH key also works as a recipient: send `~/.ssh/id_ed25519.pub` and set `SMARTLEDGER_AGE_KEY=~/.ssh/id_ed25519`.

3. Get an R2 API token for `smart-ledger-staging-creds` (Object Read only is enough to pull) and store it in `.dvc/config.local`, which git ignores:

   ```bash
   dvc remote modify --local r2-staging access_key_id <access key id>
   dvc remote modify --local r2-staging secret_access_key <secret access key>
   ```

4. After the maintainer has added your key, pull and write the env files:

   ```bash
   git pull
   scripts/secrets/pull.sh
   scripts/secrets/apply.sh
   scripts/secrets/apply.sh --apply
   ```

## Daily use

- `git pull` and `git checkout` run `pull.sh`, which rebuilds `secrets/<environment>/env/`. It never touches the files listed in `targets`.
- `scripts/secrets/apply.sh` is a dry run: per file in `targets` it lists keys that would be added (`+`), changed (`~`) or dropped (`-`), or `(comments or layout only)`. Values are never printed.
- `scripts/secrets/apply.sh --apply` writes the files and keeps each replaced one as `<file>.bak`. A key you added only on your machine shows as `-` and is lost on apply; move it into `env/` and push first.

## Change a secret

Whoever can decrypt the environment edits the file, then encrypts, uploads and commits the new pointer:

```bash
$EDITOR secrets/staging/env/.env.core
scripts/secrets/push.sh staging
git add secrets/staging/env.age.dvc
git commit -m "chore(secrets): <what changed>"
```

`push.sh` uploads to R2 before the commit, so teammates never pull a pointer to files that are not there. Updating Railway or GitHub itself is still a separate step; `.env.railway.*` and `github/` are copies, not the deploy source.

## Add or remove a person

- **Add:** append their public key to `secrets/<environment>/recipients.txt`, then run `push.sh` as in [Change a secret](#change-a-secret).
- **Remove:** delete their line, run `push.sh` again, and rotate every secret in that environment that they could read. They may still have the old file, and old versions stay in R2.

## Guard

The `secrets-guard` pre-commit hook refuses a commit that stages anything in `secrets/<environment>/` other than `recipients.txt`, `targets` and `env.age.dvc`, or a pointer that tracks anything but `env.age`. `.dvc/config.local` holds the R2 tokens and is ignored by `.dvc/.gitignore`.
