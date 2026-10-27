# Secrets and env files

Every credential the team shares (local `.env` files, Railway service variables, GitHub Actions variables) is kept as one folder of env files per environment. Git holds a small pointer to each folder, R2 holds the encrypted files, and age decides who can read them. `git pull` brings a new version into `secrets/<environment>/env/`; tools read most files there directly, and `scripts/secrets/apply.sh staging dev` copies the few that a tool reads at a fixed path, pointing them at a local database.

![Secrets sync flow](../architecture/diagrams/images/secrets-sync.svg)

Green steps change a secret; orange steps bring it to a developer machine. Edit [`secrets-sync.drawio`](../architecture/diagrams/src/secrets-sync.drawio) and re-export the SVG.

## 1. Layout

```text
smart-ledger/
├── secrets/
│   ├── staging/
│   │   ├── env/               # decrypted, one per service; ignored
│   │   │   ├── .env.ai
│   │   │   ├── .env.core
│   │   │   ├── ...
│   │   │   ├── github/        # one per GitHub Actions environment
│   │   │   └── .pulled        # what env/ last matched
│   │   ├── env.age/           # env/ encrypted, in R2; ignored
│   │   ├── env.age.dvc        # DVC pointer to env.age/; in git
│   │   ├── recipients.txt     # who can decrypt; in git
│   │   └── targets            # files apply.sh copies out; in git
│   ├── production/            # the same, without targets
│   ├── local.env.core, local.env.ai  # keys that differ on a dev machine (localhost database, dev flags); in git
│   └── admins.txt             # keys allowed to change or move a bucket; in git
└── scripts/secrets/
    ├── pull.sh                # R2 → env/; runs on pull, checkout
    ├── push.sh                # env/ → R2; after changing a secret
    ├── check.sh               # recent versions and their changes
    ├── config.sh              # bucket, endpoint and R2 token of an environment
    ├── migrate.sh             # copy an environment to a new bucket
    ├── clean.sh               # empty the bucket migrate.sh moved away from
    ├── apply.sh               # staging → dev; dry run by default
    ├── guard.sh               # pre-commit: no secrets in git
    └── lib.sh                 # helpers the scripts share
```

- **git** records which version of each folder a commit uses. It never holds a secret, not even the ciphertext. `git checkout <rev> -- secrets/staging/env.age.dvc` followed by `pull.sh` restores that version.
- **R2** stores the ciphertext. A leaked bucket exposes nothing without an age private key.
- **age** encrypts every file once for every public key in `recipients.txt`; any one matching private key decrypts it. A recipient is a public key, so committing `recipients.txt` is safe, like `authorized_keys`.
- Dev machines get only `staging/`. Only people in `production/recipients.txt` with the production R2 token can read production.

### 1.1 What R2 holds

DVC stores objects by content, at `files/md5/<first 2 characters>/<other 30>`. Each push adds:

- one `<md5>.dir` object, the md5 that `env.age.dvc` names: a JSON list of every file's `relpath` and md5. It is not encrypted, so anyone who can read the bucket sees file names such as `.env.core.age`, never values.
- one object per encrypted file, starting with `age-encryption.org/v1`.

age encrypts with a fresh random key every time, so every push uploads every file again, even unchanged ones, and file md5s cannot tell what changed. Old versions stay in R2 until someone runs `dvc gc --cloud`; that is what lets `check.sh` and `git checkout <rev> -- env.age.dvc` reach them.

### 1.2 How pull and push stay safe

`env/` is plaintext outside DVC, so DVC cannot protect it. The scripts keep `env/.pulled` (git-ignored, inside `env/`) for that: its first line is the `md5:` line of the `env.age.dvc` that `env/` last matched, and the rest is a `shasum` of every `.env.*` file at that moment. `pull.sh` and `push.sh` write it; `scripts/secrets/lib.sh` holds the checks.

| Check | True when | Used by |
|---|---|---|
| Unpushed edits | the files' checksums differ from `.pulled`, or `env/` has no `.pulled` | `pull.sh` skips the environment instead of deleting the edits; `check.sh` reports it |
| Matches the pointer | the first line of `.pulled` equals the `md5:` line of `env.age.dvc` | `pull.sh` skips `dvc pull` (no network on most checkouts); `push.sh` refuses without it |

`pull.sh` decrypts into `env.tmp/` and replaces `env/` only when every file decrypts, so a key that is not yet in `recipients.txt` leaves the old `env/` in place. It skips an environment whose R2 token is not in `.dvc/config.local`, which is the normal case for production on a dev machine, and prints dvc's own error when a download fails.

If the upload in `push.sh` fails, it puts the old `env.age.dvc` back, so running `push.sh` again works.

`push.sh` refuses to upload when:

1. `origin/staging` has a commit to `env.age.dvc` that your branch lacks. Someone pushed a newer version; merge it and pull first.
2. `env/` does not match the pointer in your checkout, for example after `git pull` brought a new pointer while `env/` held edits. Save your edits, delete `env/`, run `pull.sh` and edit again.

Two people pushing within the same minute can still both pass; the second `git push` then conflicts on `env.age.dvc`. Keep one version, pull, and push the other change again.

### 1.3 How check.sh works

`check.sh <environment> [count]` reads `git log` of `env.age.dvc` for the version (first 8 characters of its md5), time, author and commit of the last `count` versions (5 by default). For the changes column it runs `dvc fetch --all-commits` on that pointer, decrypts each version from DVC's cache into a temporary folder, compares neighbouring versions by file and by key name with the same comparison as `apply.sh`, and deletes the folder on exit. A version it cannot decrypt shows as unavailable. The author is whoever committed the pointer, usually the person who ran `push.sh`.

## 2. Env file format

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
| `## <section> ##` | Only in `github/`: starts the Variables or the Secrets section, which hold groups |
| `### <group> ###` | Starts a group of related keys |
| `# <text>` | Explanation for the group or key below it |
| one blank line | Between groups |

### 2.1 What each environment holds

| File in `env/` | Used by | staging | production |
|---|---|---|---|
| `.env.core`, `.env.ai` | Core and AI: the variables of the Railway service, with Railway references resolved, plus settings Railway leaves at their code default; staging copies go to `backend/core/.env` and `backend/ai/.env` with `local.env.*` put over them | yes | yes (read in place) |
| `.env.mobile` | mobile app; copied to `frontend/mobile/.env` | yes | no |
| `.env.release` | Android APK release: R2 bucket, keystore | no | yes |
| `.env.loadtest`, `.env.monitor` | load test and uptime monitor; staging copies go to `scripts/loadtest/.env.staging` and `scripts/monitor/.env` | yes | loadtest only |
| `.env.railway.tokens` | `RAILWAY_TOKEN`, the Railway project token of that environment for the CLI | yes | yes |
| `github/.env.<environment>` | copy of a GitHub Actions environment | 7 environments | 4 environments |

Files are named `.env.<name>`, like `.env.local` and `.env.production` in Next.js; the folder already says which environment they belong to. `targets` lists the copied files. Everything else is read in place, for example `docker compose --env-file secrets/production/env/.env.core --env-file secrets/production/env/.env.ai`, so there is no second copy to drift.

`.env.core` and `.env.ai` hold the values Railway resolves, not its reference syntax (`${{ai.RAILWAY_PRIVATE_DOMAIN}}`), so they can be read anywhere; `LOGFIRE_SERVICE_VERSION` is left out because every deploy sets it to the commit. The deploy workflow writes the `railway-<environment>` GitHub variables and secrets to Railway, so change those keys in GitHub as well, or the next deploy puts the old value back. `github/.env.*` have two sections, `## Variables ##` and `## Secrets (write-only in GitHub, values not pulled) ##`, each grouped by topic like the other files. Secrets are listed as `# NAME` lines, by name only, because GitHub never returns a secret's value.

Not in `secrets/`: `.env.r2.secrets` (the R2 tokens DVC needs to reach the files), `.env.example` files (committed templates), and generated files such as `supabase/.temp` and `frontend/mobile/ios/.xcode.env`.

## 3. Set up a machine

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
   scripts/local-db.sh
   scripts/secrets/apply.sh staging dev
   scripts/secrets/apply.sh staging dev --apply
   ```

   `scripts/local-db.sh` runs PostgreSQL with pgvector in Docker at `127.0.0.1:54322`, applies Core's Flyway migrations, then the AI migrations in `supabase/migrations`, and creates the read-only `ai_reader` login. Every step is safe to re-run, and data stays in the `smartledger-local-db` volume.

## 4. Daily use

- `git pull` and `git checkout` run `pull.sh`, which rebuilds `secrets/<environment>/env/` when `env.age.dvc` points at a new version. It never touches the files listed in `targets`.
- `pull.sh` leaves `env/` alone while it holds edits you have not pushed, and keeps the old `env/` if any file fails to decrypt. It tells edits apart through `env/.pulled`; an `env/` made before that file existed counts as edited, so delete it once and run `pull.sh`.
- `scripts/secrets/apply.sh staging dev` is a dry run: per file in `targets` it builds the staging file with the keys of `secrets/local.<name>` (the local database) put over it, and lists keys that would be added (`+`), changed (`~`) or dropped (`-`), or `(comments or layout only)`. Values are never printed. `--use-staging KEY` keeps the staging value of one local key, for example to reach the shared staging database.
- `scripts/secrets/check.sh staging [count]` shows the last 5 versions (or `count`): version, time, who committed the pointer, and which files and keys each added (`+`), changed (`~`) or dropped (`-`). It fetches old versions from R2 and decrypts them in a temporary folder, so it needs your age key; values are never printed. A renamed file shows as `-` and `+`.
- `scripts/secrets/apply.sh staging dev --apply` writes the files and keeps each replaced one as `<file>.bak` (`--no-backup` skips it). A key you added only on your machine shows as `-` and is lost on apply; add it to `secrets/staging/env/` first.
- Copying runs one way, from staging to this machine. A target is a derived copy with no record of the staging version it was built from, so sending it back could not tell your edits from keys a teammate added or rotated since, and would quietly undo theirs. To add or change a key for the team, edit it in `secrets/staging/env/` and push it as in [Change a secret](#5-change-a-secret), where `push.sh` refuses to overwrite a newer version; then `apply.sh staging dev --apply` brings it to your files. Pushing needs the R2 write token, which only the maintainer holds, so teammates send new keys to the maintainer.
- Copying to or from production is not supported.

### 4.1 The `sl` menu

`sl` puts these scripts behind one menu (Pull, Push, History, Apply, Members, Config, Migrate) with the version and `env/` state of each environment on top. Install it once with `cargo install --path tools/secrets-cli`. In the menu, `E` switches the environment, and Apply staging → dev lists the keys of `secrets/local.env.*` ticked; untick one with Space to keep its staging value. Every step that writes asks first. With arguments it runs the script directly, for example `sl push staging` or `sl apply staging dev --apply`.

## 5. Change a secret

Whoever can decrypt the environment edits the file, then encrypts, uploads and commits the new pointer:

```bash
$EDITOR secrets/staging/env/.env.core
scripts/secrets/push.sh staging
git add secrets/staging/env.age.dvc
git commit -m "chore(secrets): <what changed>"
```

`push.sh` uploads to R2 before the commit, so teammates never pull a pointer to files that are not there. It refuses to upload when `origin/staging` has a newer `env.age.dvc` or when `env/` was not pulled from the pointer in your checkout, so one person's push cannot silently replace another's; merge, pull, then edit again. Updating Railway or GitHub itself is still a separate step; `.env.core`, `.env.ai` and `github/` are copies, not the deploy source. For a secret the deploy workflow reads from GitHub (`OPENAI_API_KEY`, `LOGFIRE_TOKEN`, `RAILWAY_TOKEN` in `railway-<environment>`), `scripts/secrets/github.sh <environment>` lists which GitHub secrets it can take from `.env.core`, `.env.ai` and `.env.railway.tokens`, and `--apply` sets them; the next deploy then writes them to Railway. Secrets not in those files (Vercel, Android signing) are set in GitHub by hand.

## 6. Add or remove a person

- **Add:** append their public key to `secrets/<environment>/recipients.txt`, then run `push.sh` as in [Change a secret](#5-change-a-secret).
- **Remove:** delete their line, run `push.sh` again, and rotate every secret in that environment that they could read. They may still have the old file, and old versions stay in R2.

## 7. Move to another bucket

Only the keys listed in `secrets/admins.txt` (one age public key per line, in git) can change or move a bucket. `config.sh` with options, `migrate.sh`, `clean.sh` and the Config and Migrate items of `sl` check it first. This guards against mistakes only; the real limit is that only the maintainer holds a write token for R2.

1. `scripts/secrets/config.sh <environment>` shows the bucket, endpoint and token in use; `--url`, `--endpoint`, `--key-id` and `--secret` change one. The bucket and endpoint go to `.dvc/config`, which the team shares, and the token stays in `.dvc/config.local`.
2. `scripts/secrets/migrate.sh <environment> --url s3://<new bucket> --key-id <id> --secret <secret>` copies every object of the current bucket, which is every pushed version and still encrypted, to the new one through a temporary folder, checks the count, and only then switches `r2-<environment>` to it. Add `--endpoint` when the new bucket lives in another Cloudflare account. The old bucket is not touched; this machine remembers it as `r2-<environment>-old` in `.dvc/config.local`.
3. Commit `.dvc/config` and give each teammate a token for the new bucket ([Set up a machine](#3-set-up-a-machine), step 3).
4. Once everyone has pulled from the new bucket, `scripts/secrets/clean.sh <environment>` counts the objects in the old one and `--apply` deletes them all. This cannot be undone. In `sl` it asks you to type the environment name first.

`check.sh` reads old pointers through the current bucket, so history keeps working after the old bucket is emptied. Copying needs the AWS CLI (`brew install awscli`).

## 8. Guard

The `secrets-guard` pre-commit hook refuses a commit that stages anything in `secrets/<environment>/` other than `recipients.txt`, `targets` and `env.age.dvc`, or a pointer that tracks anything but `env.age`. `.dvc/config.local` holds the R2 tokens and is ignored by `.dvc/.gitignore`.
