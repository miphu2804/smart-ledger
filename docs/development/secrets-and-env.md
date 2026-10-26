# Secrets and env files

Every credential the team shares (local `.env` files, Railway service variables, GitHub Actions variables) is kept as one folder of env files per environment. Git holds a small pointer to each folder, R2 holds the encrypted files, and age decides who can read them. `git pull` brings a new version into `secrets/<environment>/env/`; tools read most files there directly, and `scripts/secrets/apply.sh` copies the few that a tool reads at a fixed path.

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
│   └── production/            # the same, without targets
└── scripts/secrets/
    ├── pull.sh                # R2 → env/; runs on pull, checkout
    ├── push.sh                # env/ → R2; after changing a secret
    ├── check.sh               # recent versions and their changes
    ├── apply.sh               # copy targets out; dry run by default
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
| `.env.core`, `.env.ai` | Core and AI, also the two `docker compose --env-file` files; staging copies go to `backend/core/.env` and `backend/ai/.env` | yes | yes (read in place) |
| `.env.mobile` | mobile app; copied to `frontend/mobile/.env` | yes | no |
| `.env.release` | Android APK release: R2 bucket, keystore | no | yes |
| `.env.loadtest`, `.env.monitor` | load test and uptime monitor | yes | loadtest only |
| `.env.railway.core`, `.env.railway.ai` | copy of the Railway service variables | yes | yes |
| `.env.railway.tokens` | Railway API tokens for CD | no | yes |
| `github/.env.<environment>` | copy of a GitHub Actions environment | 7 environments | 4 environments |

Files are named `.env.<name>`, like `.env.local` and `.env.production` in Next.js; the folder already says which environment they belong to. `targets` lists the copied files. Everything else is read in place, for example `docker compose --env-file secrets/production/env/.env.core --env-file secrets/production/env/.env.ai`, so there is no second copy to drift.

`.env.railway.*` keep Railway's own reference syntax (`${{core.DATABASE_PASSWORD}}`) where Railway uses it. `github/.env.*` have two sections, `## Variables ##` and `## Secrets (write-only in GitHub, values not pulled) ##`, each grouped by topic like the other files. Secrets are listed as `# NAME` lines, by name only, because GitHub never returns a secret's value.

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
   scripts/secrets/apply.sh
   scripts/secrets/apply.sh --apply
   ```

## 4. Daily use

- `git pull` and `git checkout` run `pull.sh`, which rebuilds `secrets/<environment>/env/` when `env.age.dvc` points at a new version. It never touches the files listed in `targets`.
- `pull.sh` leaves `env/` alone while it holds edits you have not pushed, and keeps the old `env/` if any file fails to decrypt. It tells edits apart through `env/.pulled`; an `env/` made before that file existed counts as edited, so delete it once and run `pull.sh`.
- `scripts/secrets/apply.sh` is a dry run: per file in `targets` it lists keys that would be added (`+`), changed (`~`) or dropped (`-`), or `(comments or layout only)`. Values are never printed.
- `scripts/secrets/check.sh staging [count]` shows the last 5 versions (or `count`): version, time, who committed the pointer, and which files and keys each added (`+`), changed (`~`) or dropped (`-`). It fetches old versions from R2 and decrypts them in a temporary folder, so it needs your age key; values are never printed. A renamed file shows as `-` and `+`.
- `scripts/secrets/apply.sh --apply` writes the files and keeps each replaced one as `<file>.bak`. A key you added only on your machine shows as `-` and is lost on apply; move it into `env/` and push first.

## 5. Change a secret

Whoever can decrypt the environment edits the file, then encrypts, uploads and commits the new pointer:

```bash
$EDITOR secrets/staging/env/.env.core
scripts/secrets/push.sh staging
git add secrets/staging/env.age.dvc
git commit -m "chore(secrets): <what changed>"
```

`push.sh` uploads to R2 before the commit, so teammates never pull a pointer to files that are not there. It refuses to upload when `origin/staging` has a newer `env.age.dvc` or when `env/` was not pulled from the pointer in your checkout, so one person's push cannot silently replace another's; merge, pull, then edit again. Updating Railway or GitHub itself is still a separate step; `.env.railway.*` and `github/` are copies, not the deploy source.

## 6. Add or remove a person

- **Add:** append their public key to `secrets/<environment>/recipients.txt`, then run `push.sh` as in [Change a secret](#5-change-a-secret).
- **Remove:** delete their line, run `push.sh` again, and rotate every secret in that environment that they could read. They may still have the old file, and old versions stay in R2.

## 7. Guard

The `secrets-guard` pre-commit hook refuses a commit that stages anything in `secrets/<environment>/` other than `recipients.txt`, `targets` and `env.age.dvc`, or a pointer that tracks anything but `env.age`. `.dvc/config.local` holds the R2 tokens and is ignored by `.dvc/.gitignore`.
