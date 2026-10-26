# Secrets and env files

Every credential the team shares (local `.env` files, Railway service variables, GitHub Actions variables) is kept in one encrypted bundle per environment. Git holds a small pointer to each bundle, R2 holds the encrypted file, and age decides who can read it. `git pull` brings a new version; `scripts/secrets/apply.sh` writes it to the env files the apps read.

## Layout

```
secrets/
  staging/
    .env             decrypted bundle, this machine only (git-ignored)
    .env.age         encrypted bundle, stored in R2 bucket smart-ledger-staging-creds (git-ignored)
    .env.age.dvc     DVC pointer: md5, size and R2 remote of .env.age (in git)
    recipients.txt   age public keys allowed to decrypt staging (in git)
  production/        the same for production, R2 bucket smart-ledger-production-creds
scripts/secrets/
  pull.sh            DVC pull and age decrypt; runs after git pull and git checkout
  apply.sh           dry run of the key changes, or --apply to write them
  guard.sh           pre-commit check that keeps bundles and ciphertext out of git
```

- **git** records which version of each bundle a commit uses. It never holds a secret, not even the ciphertext.
- **R2** stores the ciphertext. A leaked bucket exposes nothing without an age private key.
- **age** encrypts the bundle once for every public key in `recipients.txt`; any one matching private key decrypts it. A recipient is a public key, so committing `recipients.txt` is safe, like `authorized_keys`.
- Dev machines get only `staging/`. Only people in `production/recipients.txt` with the production R2 token can read production.

## Bundle format

A bundle is a list of sections. Each section is one env file; the path after `->` is where `apply.sh` writes it.

```
# Core on Railway -> .env.railway.core.staging

### Database ###
DATABASE_URL=...
DATABASE_USERNAME=...

### Zalo ###
# Explanation of the group, when it needs one.
ZALO_APP_ID=...


# AI on Railway -> .env.railway.ai.staging
```

| Line | Meaning |
|---|---|
| `# <title> -> <path>` | Starts a section. Only section headers contain ` -> <path>` at the end of the line. |
| `### <group> ###` | Starts a group of related keys inside a section |
| `# <text>` | Explanation for the group or key below it |
| one blank line | Between groups |
| two blank lines | Between sections |

The same rule applies to the env files `apply.sh` writes, because they are copies of the sections.

### What each bundle covers

| Bundle | Sections |
|---|---|
| staging | `.env.staging` (docker compose); `.env.railway.core.staging`, `.env.railway.ai.staging`; `backend/core/.env`; `backend/ai/.env`; `backend/ai/.env.mercury`; `frontend/mobile/.env`; `scripts/loadtest/.env.staging`; `scripts/monitor/.env`; `.env.github.<environment>` for `android-dev`, `android-staging`, `landing-preview`, `landing-staging`, `railway-staging`, `vercel-preview`, `vercel-staging` |
| production | `.env.production`; `.env.railway.core.production`, `.env.railway.ai.production`; `scripts/loadtest/.env.production`; `.env.railway.tokens`; `.env.github.<environment>` for `android-production`, `landing-production`, `railway-production`, `vercel-production` |

`.env.railway.*` keep Railway's own reference syntax (`${{core.DATABASE_PASSWORD}}`) where Railway uses it. `.env.github.*` hold the GitHub environment's variables; its secrets are listed by name only, because GitHub never returns a secret's value.

Not in any bundle: `.env.r2.secrets` (the R2 tokens DVC needs to reach the bundles), `.env.example` files (committed templates), and generated files such as `supabase/.temp` and `frontend/mobile/ios/.xcode.env`.

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

- `git pull` and `git checkout` run `pull.sh`, which refreshes `secrets/<environment>/.env`. It never touches the env files the apps read.
- `scripts/secrets/apply.sh` is a dry run: per env file it lists keys that would be added (`+`), changed (`~`) or dropped (`-`), or `(comments or layout only)`. Values are never printed.
- `scripts/secrets/apply.sh --apply` writes the files and keeps each replaced one as `<file>.bak`. A key you added only on your machine shows as `-` and is lost on apply; move it into the bundle first.

## Change a secret

Whoever can decrypt the environment edits the bundle, encrypts it for every recipient, and pushes both the ciphertext and the pointer:

```bash
$EDITOR secrets/staging/.env
age -R secrets/staging/recipients.txt -o secrets/staging/.env.age secrets/staging/.env
dvc add secrets/staging/.env.age
dvc push secrets/staging/.env.age.dvc
git add secrets/staging/.env.age.dvc
git commit -m "chore(secrets): <what changed>"
```

`dvc add` keeps the `remote:` line in the pointer. Push to R2 before the commit lands, otherwise teammates pull a pointer to a file that is not in R2 yet. Updating Railway or GitHub itself is still a separate step; the bundle is a copy, not the deploy source.

## Add or remove a person

- **Add:** append their public key to `secrets/<environment>/recipients.txt`, then encrypt and push as in [Change a secret](#change-a-secret).
- **Remove:** delete their line, encrypt and push again, and rotate every secret in that environment that they could read. They may still have the old file, and old versions stay in R2.

## Guard

The `secrets-guard` pre-commit hook refuses a commit that stages anything in `secrets/<environment>/` other than `recipients.txt` and `.env.age.dvc`, or a pointer that tracks anything but `.env.age`. `.dvc/config.local` holds the R2 tokens and is ignored by `.dvc/.gitignore`.
