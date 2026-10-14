# CI/CD review, 2026-10-13

Review of the GitHub Actions flow on `origin/staging` at `8af3e75`, with the findings, the plan and what is still unverified. The changes described under [Plan](#plan) sit uncommitted on the local branch `chore/split-ci-cd`; nothing is pushed and nothing has run on GitHub. This is a working note: delete it once the work is merged, because [`ci-cd.md`](ci-cd.md) is the source of truth for the flow.

## How it was measured

- Job and step durations: `gh run view <id> --json jobs` on CI runs 38362362252 (`main`), 38361263503 and 38361622450 (pull requests), 38347342462 and 38343504854 (`staging`).
- Cancelled runs: 38361257181 (push to `staging`) and 38361141426 (pull request #183).
- Artifacts and caches: `gh api repos/.../actions/artifacts` (most recent 100 of 338) and `.../actions/caches`.
- Branch protection: `gh api repos/.../branches/{main,staging}/protection`.
- History of the first split: commits `703062c` (#93) and `3cbb310` (#94).

## Findings

### F1. The release pull request cancels the staging web deploy (bug)

`deploy-web` and `deploy-landing` used the concurrency group `deploy-web-${{ github.head_ref || github.ref_name }}` with `cancel-in-progress: true`. For the release pull request `staging → main` the head branch is `staging`, so its group is the same as the push to `staging`.

Scenario seen on 2026-10-13: #182 merged into `staging` (run 38361257181), pull request #183 `staging → main` started seconds later (run 38361263503) and cancelled both deploy jobs of the push. The pull request run then deployed to the preview alias, not the staging alias. Staging web and landing are still on #180 (`bdce875`).

### F2. Every run tests and deploys everything

There is no path filter. Of the 14 commits between `33d2da4` and `8af3e75`, most touch only `frontend/mobile`, yet each one ran all jobs and redeployed Railway.

| Job | Duration | Main cost |
|---|---:|---|
| `ai` | 41–52 s | 21 s starting the PostgreSQL container, 9–12 s pytest |
| `core` | 111–180 s | Maven `verify` 70–127 s, container start 21–32 s |
| `mobile-web` | 54–61 s (one run 197 s) | `npm ci` 19–28 s, web export 16–25 s |
| `landing` | 14–24 s | |
| `container-images` | 86–162 s | `docker compose build` with no layer cache |
| `deploy` (Railway) | 77–103 s on `staging`, 475 s on `main` | `railway up` for `ai` then `core`; `core` took 370 s on `main` |
| `deploy-web` | 54–87 s (one run 173 s) | `vercel build` 26–49 s |
| `deploy-landing` | 36–44 s | |

A push to `staging` took 220–375 s end to end. A mobile-only change needs only `mobile-web` and `deploy-web`, about 2 minutes, and no backend restart.

### F3. Superseded pull request runs keep running

`ci.yml` had no workflow-level concurrency, so each new commit on a pull request left the run of the previous commit running to the end.

### F4. No job timeouts in `ci.yml`

Every job used the default of 6 hours. A hung step (a Railway upload, an npm registry stall such as the 160 s `npm ci`) would hold a runner until then.

### F5. The first CI/CD split failed for a known reason

#93 moved the Railway deploy into a called `cd.yml`; run 37263113868 failed with `Invalid RAILWAY_TOKEN` and #94 moved the job back. The call in #93 had no `secrets: inherit`. A called workflow receives no secrets unless the caller passes them, so `secrets.RAILWAY_TOKEN` was empty even though the job named the `railway-staging` environment. That the fix is `secrets: inherit` is inferred from GitHub's documented behaviour and not yet run here.

### F6. Artifacts duplicate the run page, and nothing is kept for a failed test

- `ci-summary` is 71 of the 100 most recent artifacts. Its content is the same table already written to the run summary, and nothing in the repository reads it.
- `deploy-summary-<branch>` (22 of 100) duplicates the run summary too; it is small and documented as the deploy record, so it stays.
- When `core` fails, the Maven console shows a shortened trace and the Surefire reports are lost with the runner.
- Android artifacts are 52 MB (dev, one ABI) and 122 MB (staging and production, four ABIs) each, kept 14 days, and zipped again on upload although an APK or AAB is already compressed.

### F7. The Actions cache is over its limit

75 caches, 11.8 GB against the 10 GB limit, so GitHub evicts the least recently used entries. The largest: four Gradle caches on `main` from `mobile-release.yml` (about 3.2 GB) and one 203 MB CodeQL dependency cache per pull request, kept after the pull request closes. Whether evictions hit the Maven or npm caches of CI was not measured.

### F8. Android production build: 23 minutes of Gradle

Run 38367283761 (`android-production`, `publish`, GitHub-hosted): Gradle 1388 s for four ABIs, setup under 1 minute, R2 upload 27 s. The 3 hours between start and build were the wait for approval. `x86` and `x86_64` are only used by emulators.

### F9. Checks that fail on every pull request but are not in the repository

- **GitHub Advanced Security** (event `dynamic`) fails in 30–66 s on each pull request. It is a GitHub-managed job; the log ends in process cleanup and the cause was not found.
- **Release policy** fails on each new `release/staging-to-main-<date>` branch. This is expected and documented in [CONTRIBUTING](../../CONTRIBUTING.md#target-branch): the check reads the allow-list from `main`.
- **CodeQL** (default setup) runs 300–395 s on every pull request and push. It is not a required check and its triggers cannot be path-filtered from the repository.

### F10. The Android gate depends on deploys, not only on tests

`mobile-release.yml` requires a successful `ci.yml` run for the commit. Because the deploys are jobs of that run, a failed or unapproved deploy blocks an Android build of a commit whose tests passed. The plan below does not change this.

## Plan

![Proposed CI/CD flow](../architecture/diagrams/images/ci-cd-proposed.svg)

Diagram source: [`ci-cd-proposed.drawio`](../architecture/diagrams/src/ci-cd-proposed.drawio). Green numbers are the pipeline steps; each column is one deploy target and each lower band one environment. When the change merges, this diagram replaces the pipeline band of `ci-cd.drawio`.

Steps 1–7 are implemented locally. `[Final step] → verify` is the pull request run and the first push to `staging`.

| # | Change | Addresses | State |
|---|---|---|---|
| 1 | Move the three deploy jobs into `cd-backend.yml`, `cd-web.yml` and `cd-landing.yml` (`workflow_call`); `ci.yml` keeps the tests and calls them as jobs `deploy`, `deploy-web`, `deploy-landing` with the same `needs` and `secrets: inherit` | Split, F5 | Done locally |
| 2 | Add job `changes` (a `git diff` of the base against HEAD) and run each test and deploy job only when its part changed | F2 | Done locally; script checked against five real commits |
| 3 | Workflow concurrency: a new commit on a pull request cancels the previous run; pushes are never cancelled | F3 | Done locally |
| 4 | Key the deploy concurrency groups by pull request number instead of head branch | F1 | Done locally |
| 5 | `timeout-minutes` on every job (5–20 minutes) | F4 | Done locally |
| 6 | Remove the `ci-summary` artifact; upload `ai-test-report` and `core-test-report` only on failure, kept 7 days; upload the APK/AAB with `compression-level: 0` | F6 | Done locally |
| 7 | Add `workflow_dispatch` to `ci.yml` to test and deploy everything on `staging` or `main` without a commit, and update `ci-cd.md` | Needed by step 2 | Done locally |
| 8 | Commit, open a pull request into `staging` | | Waiting for approval |
| 9 | Verify on the pull request: preview deploys read their environment secrets, the four required checks pass, the previous run is cancelled on a new commit | | Not started |
| 10 | Verify after merge: Railway staging deploys through `cd-backend.yml`; staging web and landing move to the current commit | F1 | Not started |
| 11 | Update `docs/architecture/diagrams/src/ci-cd.drawio` and re-export the SVG | | Not started |

### Design decisions

- **Called workflows, not `workflow_run`.** A `workflow_run` workflow runs on the default branch ref, so the `staging`-only branch policies of `railway-staging`, `vercel-staging` and `landing-staging` would reject it, and it always uses the workflow file from `main`. Called workflows run in the caller's context. The cost is that CI and CD remain one run.
- **Three deploy files, not one.** One called `cd.yml` would have one `needs` list, so the web preview would wait for `core` (about 2 minutes longer) and a red `core` would hold back the landing. Each deploy keeps its own gate.
- **Path filter by job `if`, not workflow `paths`.** `ai`, `core`, `mobile-web` and `container-images` are required checks on `main` and `staging`. A job skipped by `if` counts as passed; a workflow that never starts would leave the checks pending.
- **The backend deploys as one unit.** `ai` and `core` stay in one job and one concurrency group. With separate filtered jobs, a pending deploy replaced by a newer one for the other service would drop its change.

### Path filter

| Changed path | Tests | Deploy |
|---|---|---|
| `backend/ai/`, `supabase/migrations/` | `ai`, `container-images` (not for migrations) | `deploy` |
| `backend/core/` | `core`, `container-images` | `deploy` |
| `compose.yaml` | `container-images` | none |
| `frontend/mobile/` | `mobile-web` | `deploy-web` |
| `frontend/web/` | `landing` | `deploy-landing` |
| `.github/workflows/ci.yml`, `cd-*.yml` | all | all |
| anything else | none | none |

## Verification per environment

Checked on 2026-10-13 without pushing: the GitHub environment settings through the API, the live URLs with the same requests the smoke tests send, and a trace of the new workflow expressions for each event. A real run is still needed (steps 9 and 10).

### Environment settings (verified through the API)

| Environment | Branch policy | Approval | Secrets present | Variables present |
|---|---|---|---|---|
| `vercel-preview`, `landing-preview` | any | no | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | `EXPO_PUBLIC_*` (8) on `vercel-preview`; none on `landing-preview` |
| `railway-staging` | `staging` | no | `RAILWAY_TOKEN` | `CORS_ALLOWED_ORIGINS` |
| `vercel-staging` | `staging` | no | the three Vercel secrets | `EXPO_PUBLIC_*` (8), `VERCEL_STAGING_ALIAS` |
| `landing-staging` | `staging` | no | the three Vercel secrets | `LANDING_URL` |
| `railway-production` | `main` | yes | `RAILWAY_TOKEN` | `CORS_ALLOWED_ORIGINS` |
| `vercel-production` | `main` | yes | the three Vercel secrets | `EXPO_PUBLIC_*` (8) |
| `landing-production` | `main` | yes | the three Vercel secrets | `LANDING_URL`, `VITE_ANDROID_APK_URL` |

Every secret and variable the three `cd-*.yml` files read exists, except `VITE_CONTACT_EMAIL` and `VITE_LEGAL_DRAFT`, which no `landing-*` environment sets; `ci-cd.md` allows that (legal pages stay in draft). The repository has no `RUNNERS_READ_TOKEN`, so `runner=auto` in `mobile-release.yml` always resolves to GitHub-hosted.

### Trace of the new workflows

| Step | Preview (pull request #N, branch in this repository) | Staging (push to `staging`) | Production (push to `main`) |
|---|---|---|---|
| CI concurrency group | `ci-N`, previous run cancelled | `ci-<sha>`, never cancelled | `ci-<sha>`, never cancelled |
| `changes` base | pull request base commit | previous commit of `staging` | previous commit of `main`, so the whole release |
| `deploy` → `cd-backend.yml` | skipped (pull request) | `railway-staging`; CORS sync, `ai`, `core` | `railway-production` after approval; same steps |
| `deploy-web` environment | `vercel-preview` | `vercel-staging` | `vercel-production` after approval |
| `VERCEL_TARGET` | `preview` | `preview` | `production` (`--prod`) |
| Web deploy group | `deploy-web-N` | `deploy-web-staging` | `deploy-web-main` |
| Web alias | `smart-ledger-preview-0<N mod 10>.vercel.app` | `VERCEL_STAGING_ALIAS` = `smart-ledger-staging.vercel.app` | none; fixed domain `smart-ledger-prod.vercel.app` |
| Web smoke test | alias: page, endpoint in bundle, CORS on staging Core | staging alias: same checks | production domain: same checks on production Core |
| Pull request comment | yes (`pull-requests: write` granted by the calling job) | no | no |
| `deploy-landing` environment | `landing-preview` | `landing-staging` | `landing-production` after approval |
| Landing alias | `smart-ledger-landing-pr-N.vercel.app` | `LANDING_URL` = `smart-ledger-landing-staging.vercel.app` | none; `LANDING_URL` = `smart-ledger-landing.vercel.app` |
| Landing smoke test | page on the alias | page on `LANDING_URL` | page on `LANDING_URL` |

A manual run (`workflow_dispatch`) follows the staging or production column of its branch. On any other branch every deploy job resolves to a `*-staging` environment, whose branch policy is `staging` only, so it is rejected.

### Live checks

| Check | Preview | Staging | Production |
|---|---|---|---|
| Web page returns 200 | `smart-ledger-preview-03` (pull request #183): 200 | 200 | 200 |
| Core CORS allows the web origin | staging Core allows `preview-03` | staging Core allows the staging web | production Core allows the production web |
| Core CORS rejects another origin | staging Core rejects a `landing-pr` origin | | production Core rejects the staging web |
| Landing page returns 200 | not checked (no open pull request) | 200 | 200 |
| Mobile web points at | staging Core, mock off | staging Core, mock off | production Core, mock off |
| Last deployment | `60999ef`, success | Railway `8af3e75` success; web and landing `8af3e75` **error**, last success `bdce875` | all three `885d574`, success |
| APK download | | | `latest.apk`: 200, 285.6 MB |

- The staging row confirms F1 from the deployment records: the backend is on `8af3e75` and the web and landing are one commit behind.
- The published APK is 285.6 MB with four ABIs, a second reason for the F8 follow-up.

## Risks

- **A skipped deploy does not retry a failed one.** After a failed deploy, a later push that does not touch the same part leaves the old version running. Re-run the failed job, or run `ci.yml` by hand on the branch.
- **`CORS_ALLOWED_ORIGINS` sync.** It now takes effect on the next backend push or a manual run, not on any push.
- **First push after the merge deploys everything**, because the workflow files changed. This also repairs F1.
- **Rollback:** revert the pull request; the old single `ci.yml` returns unchanged.

## Not yet verified

- Environment secrets inside the called workflows (F5). The pull request checks it with `vercel-preview` and `landing-preview` before anything reaches Railway; an empty token fails the deploy and deploys nothing.
- Required checks accept the skipped jobs.
- A manual run from a branch other than `staging` or `main` is rejected by the environment branch policies. This is inferred from the environment table in `ci-cd.md`.
- Runtime after the change. The estimate of about 2 minutes for a mobile-only push comes from the job durations above.

## Follow-ups outside this change

- Delete the caches of closed pull requests (a small workflow on `pull_request: closed`) and review the Gradle caches on `main` (F7).
- Decide whether the published production APK needs `x86` and `x86_64`; dropping them would cut the Gradle time and the APK size roughly in half (F8). Product decision.
- Find out why GitHub Advanced Security fails, or turn the feature off in the repository settings (F9).
- Decide whether the Android gate should check the test jobs only (F10).
