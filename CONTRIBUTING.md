# Contributing

## Commit instructions

### Branch naming

Use lowercase branch names with a change-type prefix and hyphen-separated words:

```text
feat/transaction-confirmation
fix/ai-timeout
docs/update-api-contract
```

### Commit message

Use Conventional Commits in English, lowercase, with a maximum length of 72 characters:

```text
<type>(<scope>): <description>
```

Types:

- `feat`: new capability
- `fix`: bug fix
- `refactor`: restructure without behavior change
- `docs`: documentation, docstrings, or comments
- `test`: tests only
- `chore`: build, CI, dependencies, or tooling
- `perf`: performance improvement

Rules:

- Use a scope that names the affected module or area when it helps (for example `core`, `ai`, `mobile`, `web`, `ci`, `deploy`, or a document name for `docs`); omit it when the change spans areas. The scope is a hint for readers, not a fixed list.
- Describe the action taken, not the resulting state.
- Keep each commit focused on one related logical change.
- Do not add attribution lines, and do not mention AI generation, co-authorship, or similar metadata in commit messages or pull request descriptions unless explicitly requested.
- Add a body only when the reason is not obvious from the subject: separate it from the subject with a blank line, wrap at 72 characters, and explain why, not what the diff already shows.
- Mark a breaking change with `!` after the scope (`feat(core)!: ...`) and a `BREAKING CHANGE: <what breaks and how to migrate>` footer. Pull requests into `staging` are squashed, so the pull request title must carry the `!` and the squash commit body must keep the footer.
- Reference issues in a footer: `Closes #123` or `Refs #123`.

Examples:

```text
feat(core): add idempotent transaction confirmation
fix(ai): handle malformed parser response
test(core): cover confirmation conflict
docs(contributing): clarify contribution workflow
```

## Pull request instructions

### Target branch

This repository uses `staging` for integration and UAT, and `main` for production. Development happens on short-lived branches:

```text
feat/*, fix/*, chore/*, docs/*  →  staging  →  main (production)
```

- Open normal feature, fix, chore, and documentation pull requests against `staging`.
- A merge into `staging` may deploy automatically to the staging environment after required checks pass.
- After `staging` passes its checks, open a `staging` → `main` pull request for the production release. If the two histories conflict, resolve them on a short-lived `release/staging-to-main-<date>` branch created from `main` with `staging` merged in, add that exact branch name to the allow-list in `.github/workflows/release-policy.yml`, and delete the branch after the release. The `Release source branch` check on that pull request reads `release-policy.yml` from `main`, which still names the previous branch, so it fails; it is not a required check and does not block the merge.
- Merge release pull requests with a merge commit, never squash: squashing disconnects `staging` history from `main` and forces a manual resync. This follows the production-branch pattern in [GitLab Flow](https://about.gitlab.com/topics/version-control/what-is-gitlab-flow/) and [branch-per-environment strategies](https://docs.gitlab.com/user/project/repository/branches/strategies/).
- Production deployment requires manual approval; merging to `main` alone must not bypass this gate. A person tags the release afterwards.
- Start hotfixes from `main`, open the pull request against `main`, then synchronize the same fix back to `staging`.
- Do not push directly, force-push, or manually merge into `main` or `staging`.
- Do not introduce a long-lived `dev` or `release` branch without an explicit workflow change. The release-source policy permits only the named temporary branch for this release.

Create a feature or fix branch from `staging`:

```bash
git fetch origin
git switch staging
git pull --ff-only
git switch -c feat/<short-description>
```

### Required checks and deployment

- Pull requests into `staging` and `main` must pass configured checks before merge.
- Deploy the same tested commit or artifact from staging to production; environment-specific values belong in secrets or environment configuration.
- Run database migrations on staging before production, and only from code merged into `staging`; never from a feature branch, because dev shares the staging database (see [Database migrations](docs/development/local-development.md#database-migrations)). Destructive migrations require an explicit rollback or recovery plan.
- Required CI checks are `ai` (lint and tests), `core` (Maven verify plus Flyway migration against a fresh PostgreSQL service), `container-images` (Docker Compose build of custom service images), and `mobile-web` (TypeScript and Expo web export). Each runs only when its area changed and otherwise shows as skipped, which counts as passed (see [path filtering](docs/development/ci-cd.md#path-filtering)).
- The mobile web is built and uploaded to Vercel by job `deploy-web` of the CD workflow, which CI starts after `mobile-web` passes: `staging` gets a fixed alias and `main` production; pull requests get no preview, to stay within Vercel's daily deployment limit. See [CI/CD](docs/development/ci-cd.md#mobile-web-on-vercel).
- CI verifies migrations from an empty database. Staging and production use separate Supabase projects with separate credential files and dev shares the staging database (see [Local Compose](docs/development/local-development.md#local-compose)); backup/restore, rollback, and moving production credentials into an environment-scoped secret store still require an operational smoke check before production release.

### Pull request title

Use the Conventional Commit format for pull request titles so the title can serve as the squash commit message:

```text
<type>(<scope>): <description>
```

### Pull request description

GitHub pre-fills the description from [`.github/pull_request_template.md`](.github/pull_request_template.md) (GitHub reads templates from the default branch `main`, so this starts working after the release that carries it); keep every section and write `None` instead of deleting one. Use tables for Changes, Validation, and Risks so a reviewer can scan them, and keep the Summary short.

```markdown
## Summary
What changed and why. One sentence when there is one point; a numbered list, one point per line, when there are several.

## Changes
| Area | Change | Files / PR |
|---|---|---|

## Validation
| Check | Command / steps | Status | Result |
|---|---|---|---|

## Risks and rollback
| Risk | Impact | Rollback |
|---|---|---|

## Config and migrations
New environment variables, secrets, or migrations, or None.
```

- **Area** is the module or part of the repo that changed, usually the commit scope.
- **Summary** with more than one point is a numbered list, one point per line, so each can be referenced in review ("point 2").
- **Validation** records what was actually run. **Status** is `Verified` (run, with output), `Inferred` (reasoned from code or docs, not run), or `Not verified` (not checked; give the reason in Result, for example a real device or a production run).
- Link related documentation, API contracts, and issues (`Closes #123`), and state assumptions.
- Add screenshots or a recording for a visible UI change.

#### Release pull requests (`staging` → `main`)

Open them with [`.github/PULL_REQUEST_TEMPLATE/release.md`](.github/PULL_REQUEST_TEMPLATE/release.md): `gh pr create --base main --head staging --template release.md`, or append `?expand=1&template=release.md` to the `main...staging` compare URL. The title is `chore(release): <yyyy-mm-dd>` until releases are tagged, then the tag.

- Changes lists **every** commit in `git log --no-merges --format='%s' origin/main..origin/staging`, grouped by area with the PR number on each row, not only the latest ones. Check the row count against that log.
- Add a Breaking changes section when any commit carries `!` or a `BREAKING CHANGE:` footer, and a Config and migrations section for new variables, secrets, or migrations.
- Add a Deploy table of the steps that follow the merge and what the merge does not do by itself (for example, merging does not publish an APK); link [CI/CD](docs/development/ci-cd.md#steps) instead of restating it.
- Merge with a merge commit (see "Target branch").

### Review, rebase, and merge

- Fetch the latest remote state before opening or finalizing a pull request.
- Rebase a personal branch onto the latest target branch when appropriate.
- If a pushed branch is rebased, use `--force-with-lease`, never `--force`.
- Do not rebase or force-push shared branches.
- Use squash merge for pull requests into `staging`; use a merge commit for release pull requests into `main` (see "Target branch").
- Do not bypass review, CI, branch protection, or required checks.

## Progress log

After each completed substantive change, add an entry at the top of [`PROGRESS.md`](PROGRESS.md):

```markdown
### YYYY-MM-DD — Short title

| Area | Change |
|---|---|
| CI | • What changed and why, one line<br>• Next change |

Check: what was run, or not verified and why. Commit: `abc1234`.
```

- One row per area (Core, AI, Mobile, Web, CI, Docs). No file lists: the commit traces the files.
- Keep the file at 200 lines or fewer by deleting the oldest entries; Git history keeps them. Never cut inside an entry, even one longer than 200 lines.

`PROGRESS.md` is a log of recent work, not the source of truth for project scope.

## Blockers

Create or update `BLOCKERS.md` only when an unresolved blocker exists; do not create an empty file. Each blocker must include:

- **Status:** `Open` or `Resolved`;
- **Blocked by:** the cause or dependency;
- **Impact:** the affected work;
- **Next action:** the smallest next action.

In the pull request or issue, also record the symptom, last verified boundary, and owner or dependency when available. Do not mark the work complete while a blocker remains. If a command cannot run, record the last verified boundary instead of substituting an unverified command.
