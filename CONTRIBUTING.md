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

- Use a scope that matches the affected module or area when useful.
- Describe the action taken, not the resulting state.
- Keep each commit focused on one related logical change.
- Do not mention AI generation, co-authorship, or similar metadata unless explicitly requested.

Examples:

```text
feat(core): add idempotent transaction confirmation
fix(ai): handle malformed parser response
test(core): cover confirmation conflict
chore(docs): clarify contribution workflow
```

## Pull request instructions

### Target branch

This repository uses `staging` for integration and UAT, and `main` for production. Development happens on short-lived branches:

```text
feat/*, fix/*, chore/*, docs/*  →  staging  →  main (production)
```

- Open normal feature, fix, chore, and documentation pull requests against `staging`.
- A merge into `staging` may deploy automatically to the staging environment after required checks pass.
- After `staging` passes its checks, open a `staging` → `main` pull request for the production release.
- Merge release pull requests with a merge commit, never squash: squashing disconnects `staging` history from `main` and forces a manual resync. This follows the production-branch pattern in [GitLab Flow](https://docs.gitlab.com/topics/gitlab_flow/#production-branch-with-gitlab-flow).
- Production deployment requires a tag or manual approval; merging to `main` alone must not bypass this gate.
- Start hotfixes from `main`, open the pull request against `main`, then synchronize the same fix back to `staging`.
- Do not push directly, force-push, or manually merge into `main` or `staging`.
- Do not introduce a long-lived `dev` or `release` branch without an explicit workflow change.

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
- Run database migrations on staging before production. Destructive migrations require an explicit rollback or recovery plan.
- Initial GitHub Actions should validate documentation links and diagram sources. Add Core/FE lint, tests, build, and migration smoke tests when those runtimes are introduced.

### Pull request title

Use the Conventional Commit format for pull request titles so the title can serve as the squash commit message:

```text
<type>(<scope>): <description>
```

### Pull request description

Use the following structure for every pull request:

```markdown
## Summary
What changed and why.

## Changes
Important implementation changes.

## Validation
Tests, checks, builds, or manual verification performed.

## Risks
Known risks, migrations, compatibility concerns, or None.
```

Each pull request should identify related documentation or API contracts, assumptions, and anything that remains unverified.

### Review, rebase, and merge

- Fetch the latest remote state before opening or finalizing a pull request.
- Rebase a personal branch onto the latest target branch when appropriate.
- If a pushed branch is rebased, use `--force-with-lease`, never `--force`.
- Do not rebase or force-push shared branches.
- Use squash merge for pull requests into `staging`; use a merge commit for release pull requests into `main` (see "Target branch").
- Do not bypass review, CI, branch protection, or required checks.

## Progress log

After each completed substantive change, update [`PROGRESS.md`](PROGRESS.md) at the top of the file. Keep the entry short and include:

- **Done:** work completed;
- **Changed files:** files created, modified, or deleted;
- **Flow explained:** behavior or flow that changed;
- **Check:** checks that were run, if any.

`PROGRESS.md` is a newest-first log, not the source of truth for project scope.

## Blockers

Create or update `BLOCKERS.md` only when an unresolved blocker exists; do not create an empty file. Each blocker must include:

- **Status:** `Open` or `Resolved`;
- **Blocked by:** the cause or dependency;
- **Impact:** the affected work;
- **Next action:** the smallest next action.

In the pull request or issue, also record the symptom, last verified boundary, and owner or dependency when available. Do not mark the work complete while a blocker remains. If a command cannot run, record the last verified boundary instead of substituting an unverified command.
