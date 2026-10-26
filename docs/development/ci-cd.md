# CI/CD to Railway and Vercel

This document traces a change from a feature branch to Railway for `backend/core` and `backend/ai`, and to Vercel for the mobile web and the landing page. Two workflows, each picking its own runner ([Runners](#ci-runners)): **CI** ([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) decides which areas changed and runs the **Test** and **Report** jobs; on a push to `staging` or `main` its last job, `cd`, starts **CD** ([`.github/workflows/cd.yml`](../../.github/workflows/cd.yml)) for the commit and the areas whose checks passed. CD checks the commit and its CI result (job `gate`), then calls one deploy workflow per area: **Deploy backend** (job `deploy-backend`, [`deploy-backend.yml`](../../.github/workflows/deploy-backend.yml), when the backend and container image jobs passed), **Deploy web** (job `deploy-web`, [`deploy-web.yml`](../../.github/workflows/deploy-web.yml), see [Mobile web on Vercel](#mobile-web-on-vercel)) and **Deploy landing** (job `deploy-landing`, [`deploy-landing.yml`](../../.github/workflows/deploy-landing.yml), see [Landing page on Vercel](#landing-page-on-vercel); it also carries the admin dashboard at `/admin`). The Actions tab lists CD runs as `CD <branch> <commit>` and each deploy as `<caller job> / deploy`. Branch and review rules live in [CONTRIBUTING](../../CONTRIBUTING.md). The Android app is built by a separate manual workflow, [`mobile-release.yml`](../../.github/workflows/mobile-release.yml); see [Android build](#android-build).

## Overview

![CI, CD and Preview workflows](../architecture/diagrams/images/ci-cd.svg)

Diagram source: [`ci-cd.drawio`](../architecture/diagrams/src/ci-cd.drawio); edit it in draw.io, then re-export the SVG (`drawio -x -f svg -e --embed-svg-images --svg-theme light -b ffffff -o docs/architecture/diagrams/images/ci-cd.svg docs/architecture/diagrams/src/ci-cd.drawio`). It shows the three workflows (CI, CD, Preview), what each job checks or deploys, and where it deploys; the runtime services are in the [architecture diagram](../architecture/diagrams/images/architecture.svg).

## Steps

1. **PR into `staging`:** CI runs the tests, checks migrations on a throwaway PostgreSQL and builds the images. Job `cd` is skipped because the event is `pull_request`, so nothing deploys.
2. **Merge into `staging`:** CI runs again on the merged commit. When the push changed `ai` or `core` and none of `ai`, `core` and `container-images` failed (skipped is fine, see [path filtering](#path-filtering)), CI starts CD, whose job `deploy-backend` uses environment `railway-staging` and deploys to Railway staging. No approval is needed.
3. **PR `staging` → `main`:** open it only after checking staging (see [Target branch](../../CONTRIBUTING.md#target-branch)).
4. **Merge into `main`:** use a merge commit, never a squash. If `staging` and `main` conflict, release from a `release/staging-to-main-<date>` branch as described in [CONTRIBUTING](../../CONTRIBUTING.md#target-branch). CI runs again on `main` and starts CD; its jobs `deploy-backend` (`railway-production`) and `deploy-web` (`vercel-production`), plus `deploy-landing` (`landing-production`) when `frontend/web/` changed, wait in *Waiting*. A reviewer opens the CD run in the Actions tab → **Review deployments** → approves each of them. Only then does a job receive its production token and deploy.
5. **Check production, then tag:** the web smoke test runs against `https://smart-ledger-prod.vercel.app` and must pass; open the app and sign in. Then create the release on the commit that ran, for example `gh release create vX.Y.Z --target <merge commit> --generate-notes`. Tags are created by a person, not by CI.

<a id="path-filtering"></a>Job `changes` runs first and decides which areas a pull request (against its base branch) or a push (against the commit before the push) touched. Each test and deploy job runs only for its area; the others show as *Skipped*, which counts as passed for required checks and for the `gate` of `mobile-release.yml`:

| Area | Paths | Jobs |
|---|---|---|
| `ai` | `backend/ai/**`, `supabase/**` | `ai`, `container-images`, `deploy-backend` (step `Deploy ai`) |
| `core` | `backend/core/**` | `core`, `container-images`, `deploy-backend` (step `Deploy core`) |
| `mobile` | `frontend/mobile/**` | `mobile-web`, `deploy-web` |
| `landing` | `frontend/web/**` | `landing`, `deploy-landing` |
| `containers` | `compose.yaml` | `container-images` |

A change to `ci.yml`, `cd.yml` or `select-runner.yml` runs every job, and a change to a deploy file runs its area (`deploy-backend.yml` counts as `ai` and `core`, `deploy-web.yml` as `mobile`, `deploy-landing.yml` as `landing`); a docs-only change runs only `select-runner`, `changes`, `summary` and `cd`, which starts nothing. A re-run of CI (`github.run_attempt > 1`) on a push hands every area whose checks pass to CD (both backend services, web and landing). To redeploy without testing again, for example after changing an environment variable, start CD by hand: Actions → **CD** → **Run workflow**, branch `staging` or `main`, the full commit SHA (the branch head, or the commit to put back) and the areas; `ci-run-id` may stay empty, and the gate then reads the latest CI push run of that commit. A failed or cancelled deploy: re-run its CD run.

Each area is handed to CD on its own checks: the backend on `ai`, `core` and `container-images`, so a red `mobile-web` or `landing` does not hold back the backend; the web on `mobile-web` and the landing on `landing` only, so a red `core` does not hold back the landing. CD's `gate` checks the same jobs of the CI run again, refuses a commit that is not on the branch, and runs only from `staging` or `main`; the GitHub environments still apply their branch policy and production approval. The backend deploy uploads a `deploy-summary-<branch>` artifact (environment, commit, `ai`/`core` result) and a summary table on the run page; `deploy-web` and `deploy-landing` only add a URL line to the run summary.

<a id="ci-runners"></a>**Runners.** CI and CD each start with job `select-runner` ([`select-runner.yml`](../../.github/workflows/select-runner.yml), shared with `mobile-release.yml`), and every later job of that run uses its pick. CI reads the manual input `runner`, else the repository variable `CI_RUNNER`; CD reads its input `runner` (`default` when CI starts it), else `CD_RUNNER`, else `CI_RUNNER` (Settings → Secrets and variables → Actions → Variables). Unset means `github-hosted`. One variable, `CI_RUNNER`, moves both; set `CD_RUNNER` only to run deploys elsewhere than tests, for example tests on GitHub-hosted and deploys on a self-hosted machine:

| Value | Result |
|---|---|
| `github-hosted` | `ubuntu-24.04` |
| `self-hosted` | Any machine labelled `self-hosted`; jobs wait while every machine is busy. `select-runner` itself also runs there, so the run needs no GitHub-hosted minute; CD needs Node 22 and the JDK there for the Railway and Vercel CLIs and the Core jar |
| `auto` | A free online self-hosted machine, otherwise `ubuntu-24.04`. Needs secret `RUNNERS_READ_TOKEN` (see [Android runners](#android-runners)); without it, `ubuntu-24.04` |

- When GitHub-hosted runners cannot start (for example a billing lock), set `CI_RUNNER=self-hosted` (and clear `CD_RUNNER`, or set it to `self-hosted` too). `auto` cannot help then: its own pick runs on `ubuntu-24.04`.
- A pull request from a fork always runs on `ubuntu-24.04`, whatever the setting: the repository is public, and a fork must not run code on a self-hosted machine.
- PostgreSQL for `ai` and `core` is started with `docker run` on every runner (self-hosted machines cannot run service containers), on a free port per job, so jobs on one machine do not collide. A self-hosted machine needs Docker, Node 22, Python 3 and the JDK that `actions/setup-java` installs.
- Artifact uploads and the GitHub cache still use GitHub storage on a self-hosted runner. The summary uploads are `continue-on-error`, so a full artifact quota does not block a deploy.

## Run metadata

The last job of `ci.yml` and `cd.yml`, `metadata`, runs even when an earlier job failed and uploads `meta-<workflow>-<environment>-<run id>-<attempt>` with one `run-metadata.json`: workflow, environment (`staging`, `production`, `pr` or `other`), event, branch, commit, `actor` and `triggering_actor`, start and finish time (UTC), duration in seconds, a status, and each job with its result, runner and duration. The status is `refused` when CD's `gate` stopped the run, else the worst job result (`failure`, `timed_out`, `cancelled`, `action_required`), `skipped` when every job was skipped, or `success`. A CD run started by CI shows `github-actions[bot]` as the actor; the person who pushed is in the metadata of the CI run named by `ci-run-id`. The same row is on the run page. The step is [`.github/actions/run-metadata`](../../.github/actions/run-metadata/action.yml).

These artifacts are kept 90 days, and [`artifact-cleanup.yml`](../../.github/workflows/artifact-cleanup.yml) keeps only the newest 500 every night (02:17 UTC+07:00). Run it by hand to change `keep`; a manual run is a dry run unless `dry-run` is cleared.

## Configuration

### GitHub Environments

| Environment | Allowed branches | Approval | Secrets | Variables |
|---|---|---|---|---|
| `railway-staging` | `staging` | No | `RAILWAY_TOKEN`: project token of the Railway staging environment; `OPENAI_API_KEY` ([AI model settings](#ai-model-settings)); `LOGFIRE_TOKEN` (optional, [AI tracing settings](#ai-tracing-settings)) | `CORS_ALLOWED_ORIGINS`, AI model settings |
| `railway-production` | `main` | Yes | `RAILWAY_TOKEN`: project token of the Railway production environment; `OPENAI_API_KEY`; `LOGFIRE_TOKEN` (optional) | `CORS_ALLOWED_ORIGINS` (optional), AI model settings |
| `vercel-preview` | Any branch ([Preview](#pull-request-previews)) | No | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | `EXPO_PUBLIC_*` |
| `vercel-staging` | `staging` | No | Same as above | `EXPO_PUBLIC_*`, `VERCEL_STAGING_ALIAS` |
| `vercel-production` | `main` | Yes | Same as above | `EXPO_PUBLIC_*` |
| `landing-preview` | Any branch ([Preview](#pull-request-previews)) | No | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` of the `landing` project | `VITE_LEGAL_DRAFT` |
| `landing-staging` | `staging` | No | Same as above | `VITE_LEGAL_DRAFT`, `LANDING_URL`; admin: `VITE_ADMIN_ENABLED`, `VITE_API_ENDPOINT`, `VITE_FIREBASE_API_KEY` |
| `landing-production` | `main` | Yes | Same as above | `VITE_LEGAL_DRAFT`, `LANDING_URL`, `VITE_ANDROID_APK_URL`; admin: the same three |
| `android-dev` | None; job `gate` pairs it with branches other than `main` and `staging` | No | `ANDROID_GOOGLE_SERVICES_JSON`: Firebase config of the dev/staging project | `EXPO_PUBLIC_*` |
| `android-staging` | `staging` | No | `ANDROID_GOOGLE_SERVICES_JSON`: Firebase config of the staging project | `EXPO_PUBLIC_*` |
| `android-production` | `main` | Yes | `ANDROID_GOOGLE_SERVICES_JSON`: Firebase config of the production project; `ANDROID_KEYSTORE_*` ([Release signing](#release-signing)); `R2_*` ([Publish the APK](#publish-the-apk-for-the-landing-page)) | `EXPO_PUBLIC_*`, `R2_BUCKET` |

Do not put backend secrets in the `vercel-*` or `landing-*` environments.

Each Railway project token can deploy to exactly one Railway environment, so a job running with `railway-staging` cannot deploy to production.

### Railway

- One project with two environments, `staging` and `production`, each with services `core` and `ai`. Service names must match `--service` in the workflow.
- The workflow uploads code with `railway up backend/<service> --path-as-root`, so each service's **Root Directory** stays empty and GitHub auto-deploy stays **off** (otherwise every commit deploys twice).
- Service variables (database, Firebase, `INTERNAL_API_TOKEN`, model key…) are set on Railway per environment; GitHub keeps only the deploy token, `CORS_ALLOWED_ORIGINS`, the [AI model settings](#ai-model-settings) and the [AI tracing settings](#ai-tracing-settings). Railway does not mount files, so Core receives the Firebase Admin key through `FIREBASE_SERVICE_ACCOUNT_JSON` (the full service-account JSON, one service account per environment); when it is empty, Core falls back to `GOOGLE_APPLICATION_CREDENTIALS` as in local runs.

### Railway service variables

Enter each value once and reuse it with a [reference variable](https://docs.railway.com/guides/variables#reference-variables), so Railway fills it in for the environment being deployed. Staging and production then share one configuration with different values, and rotating a secret touches one place.

**Shared Variables** (Project Settings → Shared Variables, set per environment):

| Variable | Value |
|---|---|
| `INTERNAL_API_TOKEN` | Random string, different for staging and production |

**Service `core`:**

| Variable | Value |
|---|---|
| `AI_BASE_URL` | `http://${{ai.RAILWAY_PRIVATE_DOMAIN}}:8001` |
| `INTERNAL_API_TOKEN` | `${{shared.INTERNAL_API_TOKEN}}` |
| `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` | Supabase of the matching environment (JDBC URL) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase project of the matching environment |
| `FLYWAY_ENABLED` | `false` |
| `CORS_ALLOWED_ORIGINS` | Managed from GitHub, see [Core CORS origins](#core-cors-origins). Do not edit it on Railway. |
| `CLOUDINARY_ENABLED` | `true` only after V13 is migrated in the matching environment; otherwise leave `false` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary credential for this environment, stored as Railway secrets/reference variables only; never Vercel or GitHub Variables |
| `CLOUDINARY_PUBLIC_ID_PREFIX` | Required when enabled; distinct namespace such as `smartledger/staging` or `smartledger/prod`, with no leading/trailing slash or `..` |
| `MEDIA_UPLOAD_LEASE_SECONDS` | Optional PENDING upload lease; retain Core default `300` unless operations approves a different bounded retry window |
| `CLOUDINARY_CLEANUP_FIXED_DELAY_MS` | Optional; retain the Core default `60000` in hosted environments unless an operations decision changes it |

**Service `ai`:**

| Variable | Value |
|---|---|
| `INTERNAL_API_TOKEN` | `${{shared.INTERNAL_API_TOKEN}}` |
| `POSTGRES_URL` | Supabase of the matching environment (`postgresql://…`) |
| `AI_SQL_READER_URL` | Read-only `ai_sql_reader` login (AI baseline in `supabase/migrations/`) as a `postgresql://` URL, not a libpq keyword string; when empty, the agent cannot read shop data |
| `REDIS_URL` | Redis Cloud of the matching environment |
| `POSTGRES_POOL_MAX_SIZE`, `SQL_POOL_MAX_SIZE` | Optional, default `2` each; GitHub does not set them. Both pools count against the Supabase session-pooler limit shared with Core, so keep them small. See [AI README](../../backend/ai/README.md#routes-and-database-access). |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `MODEL_PROVIDER`, `MODEL_NAME`, `MODEL_FALLBACKS`, `MODEL_REASONING_EFFORT` | Managed from GitHub, see [AI model settings](#ai-model-settings). Do not edit them on Railway. |
| `LOGFIRE_TOKEN`, `LOGFIRE_ENVIRONMENT`, `LOGFIRE_SERVICE_VERSION` | Managed from GitHub, see [AI tracing settings](#ai-tracing-settings). Do not edit them on Railway. |
| `AGENT_MEMORY_ENABLED`, `AGENT_MEMORY_TYPES`, `AGENT_MEMORY_EMBEDDING_PROVIDER`, `AGENT_MEMORY_EMBEDDING_MODEL`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Optional, set on Railway only; GitHub does not sync them. Long-term memory stays off unless `AGENT_MEMORY_ENABLED=true`, and it is not product behavior until the PO approves it ([ADR-0002](../architecture/adr/0002-agent-long-term-memory.md)). The image leaves out the `memory` dependency group, so on Railway memory runs only with `AGENT_MEMORY_EMBEDDING_PROVIDER=cloudflare`, a Workers AI model in `AGENT_MEMORY_EMBEDDING_MODEL` and both `CLOUDFLARE_*` values, after both agent memory migrations are pushed. See [AI README](../../backend/ai/README.md#long-term-memory-off-by-default). |

- `ai` has no public domain; `core` calls it over the private network. Port `8001` is AI's default `SERVER_PORT`, not the `PORT` Railway assigns, so changing `SERVER_PORT` on `ai` requires updating `AI_BASE_URL`.
- Variables have local defaults (`AI_BASE_URL` defaults to `http://localhost:8001`), so a missing variable on Railway still reports a successful deploy while Core cannot reach AI. After changing variables, run one chat through Core on staging.
- Backend secrets live only on Railway, except `OPENAI_API_KEY` and `LOGFIRE_TOKEN`, which the deploy copies from the `railway-*` GitHub environment. The mobile web Vercel project receives only `EXPO_PUBLIC_*`.
- Before enabling Cloudinary in staging/production, run V13 from merged code under the approved migration workflow, then set the variables above and run a controlled upload/replace/delete smoke check. Use separate Cloudinary credentials or at least non-overlapping prefixes per environment. `CLOUDINARY_API_SECRET` must never be placed in `EXPO_PUBLIC_*`, GitHub Variables, client source, Swagger request data, audit metadata or logs.

### AI model settings

Step `Sync ai model settings` copies these from the `railway-staging` or `railway-production` GitHub environment to Railway service `ai` before deploying it, so the new AI starts with them. A setting left unset on GitHub keeps its Railway value.

| Name | Kind | Value |
|---|---|---|
| `OPENAI_API_KEY` | Secret | Model gateway key, shared by every model (OpenAI or OpenCode Go) |
| `OPENAI_BASE_URL` | Variable | `https://opencode.ai/inference/go/v1` for OpenCode Go; for OpenAI itself, `https://api.openai.com/v1` |
| `MODEL_PROVIDER`, `MODEL_NAME` | Variable | Primary model and the API it speaks (`openai`, `openai-chat`, `anthropic`), e.g. `anthropic` and `claude-haiku-5-5`; see [`backend/ai/README.md`](../../backend/ai/README.md) |
| `MODEL_REASONING_EFFORT` | Variable | `none`, `low`, `medium` or `high` |
| `MODEL_FALLBACKS` | Variable | Optional JSON list of `provider:model`, e.g. `["openai-chat:deepseek-v4.1-flash"]` |

`anthropic` models need `OPENAI_BASE_URL` set; without it AI starts with chat disabled. A step cannot clear a Railway value: an emptied GitHub setting is skipped, so delete the value on Railway as well.

### AI tracing settings

Step `Sync ai tracing settings` sets these on Railway service `ai` before deploying it. Traces carry no message content; see [AI README](../../backend/ai/README.md#tracing-logfire).

| Name | Source | Value |
|---|---|---|
| `LOGFIRE_TOKEN` | Secret of the `railway-staging` or `railway-production` GitHub environment | Write token of the Logfire project, a separate token per environment so one can be revoked alone. Unset: the step skips it and AI sends traces only if Railway already holds a token |
| `LOGFIRE_ENVIRONMENT` | Derived from the branch | `staging` on `staging`, `production` on `main` |
| `LOGFIRE_SERVICE_VERSION` | Derived | The deployed commit (`github.sha`), shown on each trace |

The container is uploaded without `.git`, so Logfire cannot read the commit itself. To turn tracing off, delete `LOGFIRE_TOKEN` on GitHub and on Railway: as for the model settings, an emptied GitHub secret is skipped, not cleared.

### Core CORS origins

![Sign-in and API request flow per environment](../architecture/diagrams/images/auth-request-flow.svg)

Diagram source: [`auth-request-flow.drawio`](../architecture/diagrams/src/auth-request-flow.drawio), exported like the CI/CD diagram above. A browser request passes two domain gates, Firebase Authorized domains (step 1) and Core CORS (step 3), and Core accepts only ID tokens from its own Firebase project (step 5).

Core accepts browser calls only from the exact origins in `CORS_ALLOWED_ORIGINS`: comma-separated, `http(s)` only, no wildcard, path or trailing `/`. Core trims spaces and line breaks around each entry, but one inside an entry (for example two origins joined by a line break instead of a comma) is invalid, and Core **refuses to start** on any invalid entry, so such a value pasted on Railway takes staging down. The GitHub sync step rejects any whitespace.

The value is kept in the **Variables** of GitHub environments `railway-staging` and `railway-production`. Before deploying Core, step `Sync core CORS origins` rejects whitespace or wildcards and writes the value to Railway service `core`. When the GitHub variable is unset, the step is skipped and the Railway value stays as is. A change takes effect on the next push to the branch, or by re-running the `deploy` job.

Staging value:

```text
https://smart-ledger-staging.vercel.app,https://smart-ledger-preview-00.vercel.app,…,https://smart-ledger-preview-09.vercel.app
```

The ten `smart-ledger-preview-0N` origins belong to [pull-request previews](#pull-request-previews); the same domains must also be listed in Firebase Authorized domains for sign-in to work.

## Production environment checklist

Check each item before deploying to a new production environment. A deploy can report success while production still cannot work:

| Check | Where | Symptom when missing |
|---|---|---|
| Project token of the **production** Railway environment stored as `RAILWAY_TOKEN` in `railway-production` | Railway → project → Settings → Tokens | Step `Sync core CORS origins` fails with `Invalid RAILWAY_TOKEN`; no backend deploy |
| Email/Password (and Phone, if used) enabled; the web domain listed under Authorized domains | Firebase Console of the production project → Authentication | Sign-in returns 400 `signInWithPassword`; the app says the sign-in method is not enabled |
| AI baseline applied to the production database | [Database migrations](../../README.md#database-migrations): run `db push` with `--dry-run` first | Chat returns 503 `ai_unavailable`; the `ai` log shows `relation "chat_conversations" does not exist` |
| All Core migrations applied | [Database migrations](../../README.md#database-migrations) | Core fails the schema check or queries fail |
| `CORS_ALLOWED_ORIGINS` set on `railway-production` to `https://smart-ledger-prod.vercel.app` | GitHub environment variable | Smoke test fails with `Core CORS does not allow <URL>`; browser calls to Core are blocked |
| Supabase Data API off for staging and production | Supabase → Settings → Data API | The `public` tables are readable through the anon key; Core and AI connect directly and do not use it |

A new Firebase project limits SMS to 10 a day until a billing account is attached, which affects phone sign-in only.

## What this flow does not do yet

- No database migrations. Flyway stays off (`FLYWAY_ENABLED=false` on Railway and the Compose default; Core itself runs it when the variable is unset) and `supabase db push` is not in CI; the migration owner runs them by hand following [Database migrations](../../README.md#database-migrations), on staging before production.
- No path filtering: every push to `staging` or `main` redeploys both `ai` and `core`, even for a mobile-only change.
- Rollback: pick the previous deploy on the Railway dashboard → **Redeploy**; there is no automated step.

## Mobile web on Vercel

Job `deploy-web` builds `frontend/mobile` on the runner (`vercel build`) and uploads the build to Vercel (`vercel deploy --prebuilt`). Vercel does not build from Git (`git.deploymentEnabled: false` in `frontend/mobile/vercel.json`), so each commit deploys once and GitHub is the only place holding web configuration.

| Event | Environment | Result |
|---|---|---|
| PR | — | No deploy (see below) |
| Push `staging` | `vercel-staging` | Preview deploy, then aliased to `VERCEL_STAGING_ALIAS`; the GitHub Deployments link is `https://smart-ledger-staging.vercel.app` |
| Push `main` | `vercel-production` | Production deploy after approval; the smoke test and the GitHub Deployments link use `https://smart-ledger-prod.vercel.app` |

- The `url` of `vercel-staging` and `vercel-production` is set in `deploy-web.yml` and fixed to the two domains above, so the repository's Deployments panel links to them. `vercel-preview` has no `url`: its alias depends on the PR number and is already commented on the PR. If a domain changes in Vercel (Project → Settings → Domains), update `deploy-web.yml` too.
- <a id="pull-request-previews"></a>Pull requests get a preview only on demand: Actions → Preview → Run workflow, with the PR number and `web`, `landing` or both. Automatic previews used up the Vercel Hobby limit of 100 deployments a day, and once it ran out the `staging` and `main` deploys failed too. [`preview.yml`](../../.github/workflows/preview.yml) deploys the head of an open PR from this repository (never a fork, since the preview environments hold Vercel tokens) through `deploy-web.yml` and `deploy-landing.yml` with input `pr`; the web preview takes the alias `smart-ledger-preview-0<PR number % 10>` and edits the bot's last PR comment with the URL, the landing takes `smart-ledger-landing-pr-<PR number>`. CD never runs for a pull request. The Preview workflow can be started only once it is on `main`.
- Only job `mobile-web` must pass; the web does not wait for the backend deploy.
- `EXPO_PUBLIC_*` values are baked into the bundle at build time, so set them as **Variables** (not Secrets) of each environment: `EXPO_PUBLIC_USE_MOCK`, `EXPO_PUBLIC_MOCK_CORE`, `EXPO_PUBLIC_MOCK_SHOPS`, `EXPO_PUBLIC_API_ENDPOINT`, `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`, and optionally `EXPO_PUBLIC_ZALO_LOGIN` (`true` only once that environment's Core has `ZALO_ENABLED=true` and lists the web origin in `ZALO_CLIENT_ORIGINS`; unset keeps the Zalo button at "Sắp có"). Re-run the job after changing one so the web picks it up.
- `EXPO_PUBLIC_API_ENDPOINT`, `EXPO_PUBLIC_USE_MOCK`, `EXPO_PUBLIC_MOCK_CORE` and `EXPO_PUBLIC_MOCK_SHOPS` have no default in code: `frontend/mobile/src/config.ts` stops the app at launch when one is missing or a flag is not `true`/`false`.
- Calling the real Core from a browser needs the web origin in Core's [`CORS_ALLOWED_ORIGINS`](#core-cors-origins) and the web domain in Firebase Authorized domains. Each deploy URL carries a random hash and cannot be listed, so previews use ten fixed aliases, `smart-ledger-preview-00` … `-09`. Two open PRs sharing a last digit overwrite each other's alias; re-run the job to take the slot back.
- The smoke test fails the job when the deployed web would not reach Core: page not returning 200, API endpoint missing from the bundle, or Core rejecting the origin's CORS preflight. Mock builds skip the Core checks.
- `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` come from Vercel Project Settings → General; create `VERCEL_TOKEN` under Account Settings → Tokens, scoped to the project's team.

## Landing page on Vercel

Job `landing` runs `npm run lint` and `npm run build` in `frontend/web` on every push and PR. Job `deploy-landing` (after `landing`) builds the landing on the runner and uploads it to a separate Vercel project, `landing`, the same way as `deploy-web`. Vercel's Git deployments are off in [`frontend/web/vercel.json`](../../frontend/web/vercel.json) (`git.deploymentEnabled: false`), so a push deploys only through this job.

| Event | Environment | Result |
|---|---|---|
| PR | — | No deploy, like `deploy-web` |
| Push `staging` | `landing-staging` | When the landing changed: preview deploy, then aliased to `LANDING_URL`; smoke test on `LANDING_URL` |
| Push `main` | `landing-production` | When the landing changed: production deploy after approval; smoke test on `LANDING_URL` |

- Vercel project `landing`: **Root Directory** `frontend/web`. Store its project ID as `VERCEL_PROJECT_ID` in each `landing-*` environment; `VERCEL_TOKEN` and `VERCEL_ORG_ID` are the same team values as `vercel-*`.
- `LANDING_URL` is the fixed domain (`https://…`) of the environment. Set it in `landing-staging` and `landing-production`.
- `VITE_LEGAL_DRAFT` must stay unset or `true` until the product owner approves the legal pages; set `false` only in `landing-production` after approval. The contact email and the Facebook/TikTok links are not environment variables: they live in [`frontend/web/site.yaml`](../../frontend/web/site.yaml).
- `deploy-landing` runs only when the push changes `frontend/web/`, `ci.yml`, `cd.yml`, `select-runner.yml` or `deploy-landing.yml` (see [path filtering](#path-filtering)), so a push that leaves the landing alone does not spend one of Vercel's 100 daily deployments. After changing a `landing-*` variable, start CD by hand with only `landing` (see [path filtering](#path-filtering)); a re-run of CI also hands the landing to CD. If a landing deploy was cancelled or failed, re-run its CD run.
- Vercel Authentication (Settings → Deployment Protection) must stay off on the `landing` project. With it on, preview deployments redirect to the Vercel login (`302`) and the smoke test fails on pull requests and on `staging`.
- **Admin dashboard at `/admin`:** the landing build includes the admin (real Core data, `VITE_USE_MOCK=false`) when the GitHub environment sets `VITE_ADMIN_ENABLED=true` with `VITE_API_ENDPOINT` (Core root of that environment, no `/api/v1`) and `VITE_FIREBASE_API_KEY` (Web API key of the Firebase project Core verifies tokens against, the same value as `EXPO_PUBLIC_FIREBASE_API_KEY` of `vercel-*`). Both are public client values, so they are variables, not secrets. Without the flag the build has no admin code.
- Step `Check the admin in the build` fails the job if the mock demo password `admin123` is in the output, if the flag is on but the admin routes, `VITE_API_ENDPOINT` or `VITE_FIREBASE_API_KEY` are missing, or if the flag is off but an `AdminRoutes-*` chunk is there (a `VITE_ADMIN_ENABLED=true` set in the Vercel project `landing` would come in through `vercel pull`). With the flag on, the smoke test also opens `LANDING_URL/admin/login` and fails if Core still rejects a CORS preflight from `LANDING_URL` after 5 minutes (it waits for a Core deploy running in the same CI run).
- Add `LANDING_URL` to `CORS_ALLOWED_ORIGINS` of the matching `railway-*` environment; Core applies it on its next deploy. Until then the browser blocks every admin call.
- Admin accounts are Firebase email/password users of that environment whose Core profile has `system_role=ADMIN` and is ACTIVE; Core never promotes anyone, so a teammate with database access sets the role.

## Android build

[`mobile-release.yml`](../../.github/workflows/mobile-release.yml) builds the Android app only when someone starts it (`workflow_dispatch`); no push or pull request triggers it. It lives outside `ci.yml` so the Android toolchain is downloaded only when needed and a change here cannot affect the backend and web gates. The Expo cloud build (`eas build`) is not used because the free plan queues builds behind paid ones ([Expo build queues](https://github.com/expo/fyi/blob/main/eas-build-queues.md)).

### Run a build

Job `build` runs [`scripts/android-release.sh`](../../scripts/android-release.sh) for the build itself (`npm ci`, `expo prebuild --clean`, Gradle with the environment's ABIs and keystore, APK contents), and keeps only what needs CI around it: the gate, the runner, the toolchain, the secrets, the R2 publish and the artifacts. To build on your own machine without this workflow, run the same script from any checkout. Locally it defaults to an APK for the emulator's ABI, installed and opened on an Android emulator (a running one, else it starts an AVD while Gradle runs, and offers to create one when none exists); `--build-only` builds the CI default, an APK for `armeabi-v7a,arm64-v8a`, without installing, and so do `--aab` and `--out`. In GitHub Actions the default stays build-only. `--abis`, `--install` (a phone over adb) and `--emulator` change the target. Locally it turns the mocks off and points at staging Core like [`ios-device-release.sh`](../../scripts/ios-device-release.sh), and signs with the debug key unless `RELEASE_KEYSTORE` and `KEYSTORE_PASSWORD` are set. On a machine that lacks something (JDK 17, Android Studio and the SDK, the pinned SDK packages, `google-services.json`; with `--install`, a phone that allows USB debugging, carries an ABI of the build and runs API 24 or newer, picked from a menu or with `--device` when several are connected) the preflight lists every problem and, in a terminal, offers to start the fix: open the download page or Android Studio, run `brew` or `sdkmanager`. `--check` runs only the preflight; `--skip-preflight` builds anyway. Both device scripts share [`scripts/lib/preflight.sh`](../../scripts/lib/preflight.sh), and their messages are in English.

Actions tab → **Mobile release** → **Run workflow**, choose the branch in *Use workflow from*, then the inputs; or `gh workflow run mobile-release.yml --ref <branch> -f environment=<environment> -f runner=auto`.

The branch picks the code and the environment picks the config (Firebase file, `EXPO_PUBLIC_*`, approval), and job `gate` allows only one pair per branch:

| Branch | Environment | Points at |
|---|---|---|
| `main` | `android-production` | Production Core and Firebase |
| `staging` | `android-staging` | Staging Core and Firebase |
| any other branch | `android-dev` | Staging Core and Firebase (the dev environment shares the staging backend) |

| Environment | Builds from | Output | ABIs |
|---|---|---|---|
| `android-dev` | Any branch except `main` and `staging`, including a pull request branch; no CI-green check | APK | `arm64-v8a` |
| `android-staging` | `staging`, after a green CI run on the commit | APK | `armeabi-v7a`, `arm64-v8a` |
| `android-production` | `main`, after a green CI run and approval | AAB, or APK with `publish` | `armeabi-v7a`, `arm64-v8a` |

Job `gate` rejects a branch and environment that do not pair as above, or a staging or production commit without a successful `ci.yml` run, before any runner starts. Only people with write access can run a workflow, and forks cannot.

<a id="android-runners"></a>
### Runners

Job `select-runner` (the shared [`select-runner.yml`](../../.github/workflows/select-runner.yml), with label `android-build`; CI uses it too, see [Runners](#ci-runners)) resolves input `runner`:

| Input | Result |
|---|---|
| `github-hosted` | `ubuntu-24.04` |
| `self-hosted` | A machine labelled `android-build`; the job waits if none is free |
| `auto` | A free online `android-build` machine, otherwise `ubuntu-24.04` |

`auto` lists runners through the GitHub API, which the default `GITHUB_TOKEN` cannot do. Create a fine-grained token with repository permission **Administration: read** and store it as repository secret `RUNNERS_READ_TOKEN`; without it `auto` always falls back to GitHub-hosted, and the reason is written in the build summary.

A GitHub-hosted runner installs Node, JDK, SDK, NDK and Gradle with caching on every run. A self-hosted machine already holds them and its Gradle and npm caches, so nothing is installed there. On every runner, and on a laptop, `scripts/android-release.sh` first runs its preflight: it reads the pinned block at the top of the workflow and fails, with one `::error::` line per problem in Actions, when Node, the JDK, the SDK platform, build-tools or the NDK differ, or when the Firebase file or the keystore is missing. It never downloads: pulling GitHub's cache or the roughly 1 GB NDK over a home connection is slower than the build.

To add a machine: install Node 22, JDK 17, and the Android SDK with platform 36, build-tools 36.0.0 and NDK 27.1.12297006; set `ANDROID_HOME`; register a runner (repository Settings → Actions → Runners) with the label `android-build`.

- Keep the repository's workflow triggers to `workflow_dispatch` and `push` on trusted branches for any job that can run on self-hosted; never `pull_request` from forks, because the job executes the branch's code on a teammate's machine.
- A self-hosted job runs whatever the chosen branch contains, so `android-dev` secrets must hold only dev-level values.
- Windows and Linux machines use the same label and script. Windows is untested: the C++ build of React Native's New Architecture can hit the 260-character path limit, so enable long paths and keep the runner's work folder short.

### Configuration

Each `android-*` environment needs:

- Secret `ANDROID_GOOGLE_SERVICES_JSON`: the content of `google-services.json` for that environment's Firebase project. The job writes it to a temp path and points `GOOGLE_SERVICES_JSON` at it, which [`app.config.js`](../../frontend/mobile/app.config.js) already reads.
- Variables `EXPO_PUBLIC_*`, the same list as [Mobile web on Vercel](#mobile-web-on-vercel).
- Variable `STT_MODEL_BASE_URL`: the public R2 address (`https://pub-<hash>.r2.dev`) that holds the speech model, which the app downloads on first use because it is not in git. Step `Resolve the speech model URL` checks every file of `STT_MODEL_VERSION` there and sets `EXPO_PUBLIC_STT_MODEL_URL`. When files are missing, a publish fetches the model from HuggingFace and uploads it with the R2 secrets; a test build has no R2 secrets and only warns. A publish fails without the variable. Source, versioning and a local check: [`frontend/mobile/assets/models/README.md`](../../frontend/mobile/assets/models/README.md#đưa-model-lên-r2). It can be a repository variable shared by every `android-*` environment.
- Deployment branches and approval as in the table under [GitHub Environments](#github-environments).

### Release signing

A build is signed with the release keystore when its environment holds the two secrets below; otherwise it keeps the debug keystore of the Expo template, whose key is public. `expo prebuild --clean` rewrites `build.gradle` on every run, so the workflow does not edit it: it passes the keystore to Gradle through the Android Gradle plugin's injected signing properties (`-Pandroid.injected.signing.*`).

Create the keystore once, with the alias the workflow expects (`RELEASE_KEY_ALIAS`, `smart-ledger`). It is PKCS12, so one password covers the store and the key:

```bash
keytool -genkeypair -v -keystore smart-ledger-release.keystore -alias smart-ledger -keyalg RSA -keysize 2048 -validity 10000
base64 -i smart-ledger-release.keystore | pbcopy   # Linux: base64 -w0 smart-ledger-release.keystore
```

| Secret of `android-production` | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | The base64 text of the keystore file |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password |

- Never commit the keystore: the repository is public.
- Facebook Login identifies the app by its signing certificate. After creating the keystore, add its key hash (the base64 form of the SHA-1 fingerprint) to the Meta app, or Facebook sign-in fails in the release-signed build. Email and password sign-in does not depend on the certificate; Google or phone sign-in, if added later, needs the SHA-1 and SHA-256 fingerprints in the production Firebase project. `keytool -list -v -keystore smart-ledger-release.keystore` prints the fingerprints.
- Keep a copy of the file and its password outside GitHub. Android only installs an update signed with the same key, and a secret cannot be read back, so losing the keystore means every user must uninstall the app (and lose its local data) to get the next version.

### Publish the APK for the landing page

![Android APK release and download](../architecture/diagrams/images/apk-release.svg)

Diagram source: [`apk-release.drawio`](../architecture/diagrams/src/apk-release.drawio), exported like the CI/CD diagram above. Green numbers are the publish pipeline; orange numbers are a shop owner downloading the app.

Run the workflow from `main` with `environment=android-production` and `publish=true`. The build then produces a release-signed APK instead of the AAB and uploads it to a Cloudflare R2 bucket:

| Key | Purpose |
|---|---|
| `android/production/latest.apk` | The fixed URL the landing page links to; overwritten by every publish and served as `so-nghe-loi.apk` |
| `android/production/builds/<artifact name>.apk` | One copy per publish, for rollback; the in-app update downloads this copy because it is never overwritten |
| `android/production/version.json` | `{versionCode, versionName, apk}` of the latest publish, written after the APK so a phone never reads a manifest whose file is missing |

The job stops before the build when a publish setting is missing or the runner has no `aws` CLI, and refuses to upload an APK signed with the debug key. Job `gate` rejects `publish` on any other environment.

One-time setup:

1. Cloudflare dashboard → R2 → create a bucket → Settings → **Public Development URL** → Enable. The public address is `https://pub-<hash>.r2.dev`.
2. R2 → **API Tokens** → create a token with **Object Read & Write**, limited to that bucket.
3. In GitHub environment `android-production`, add secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`, and variable `R2_BUCKET`.
4. Set variable `VITE_ANDROID_APK_URL=https://pub-<hash>.r2.dev/android/production/latest.apk` in GitHub environment `landing-production`, then start CD by hand with `landing` (see [Landing page on Vercel](#landing-page-on-vercel)). While the variable is empty the download button is disabled and reads "Sắp ra mắt".
5. Optional: add an R2 lifecycle rule that deletes objects under `android/production/builds/` after 30 days. Never let it match `stt-model/`, which old APKs still download from.
6. Set variable `R2_PUBLIC_URL=https://pub-<hash>.r2.dev` (no trailing slash) in the same environment. The publish step stops without it, because the APK would not know where to look for updates.
7. Set variable `STT_MODEL_BASE_URL=https://pub-<hash>.r2.dev` (see [Configuration](#configuration)). The first publish uploads the speech model under `stt-model/<version>/`.

- The `r2.dev` address is rate-limited, not cached, and meant for development ([public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)); it is a stopgap until the project owns a domain on Cloudflare. Moving to a custom domain only changes `VITE_ANDROID_APK_URL`.
- In-app update: a published APK is built with `ANDROID_VERSION_CODE=<run number>` and `EXPO_PUBLIC_UPDATE_URL=$R2_PUBLIC_URL/android/production/version.json`. On launch the app fetches `version.json`; when its `versionCode` is higher than the installed one it offers to download the APK and hands it to Android's installer, which asks the user to confirm (and, the first time, to allow installs from the app). Android only installs it over the old app when it is signed with the same keystore. Builds without the URL (dev, staging, a Play Store AAB) never check and do not declare `REQUEST_INSTALL_PACKAGES`, which Play does not allow. APKs published before this feature carry no update URL and never ask, so those users download the APK once more from the landing page. After a rollback, edit `version.json` too, or phones keep being offered the newer build. Do not re-run an old publish run: it keeps its run number and file name, so it overwrites that `builds/` file and moves `latest.apk` and `version.json` back.
- Rollback: copy a file from `builds/` over `latest.apk` in the R2 dashboard. Android refuses to install an older version over a newer one, so this only helps people who have not updated yet.

### Result

Every run uploads `android-build-summary-<environment>-<run number>` (`.md` and `.json`: runner and why it was chosen, commit, toolchain, time per phase, step outcomes, artifact size and SHA-256), also on failure, and the same table on the run page. An APK build also writes its contents to the run page ([`scripts/apk-contents.sh`](../../scripts/apk-contents.sh)): the total size, the raw and stored size of the native libraries per ABI, dex, resources and assets, and the 40 largest entries, so a size change can be traced without downloading the file. A successful run also uploads `android-<environment>-<run number>`, the APK or AAB named `smart-ledger-<environment>-<branch>-<commit>`; artifacts are kept 14 days.

### Measured and not yet verified

- Measured on an Apple M4 Pro (12 cores) with a warm Gradle cache, 4 ABIs, a placeholder Firebase file: prebuild 1 s and `assembleRelease` 4 min 3 s. The first build on a machine was blocked for over 30 minutes downloading the NDK over a slow connection, and Gradle stalled with the default 2 GB heap and 512 MB Metaspace; the workflow passes `-Xmx6g -XX:MaxMetaspaceSize=1g`.
- Measured on `ubuntu-24.04` (run 37740574672, `android-dev` config built from `main`, before the gate paired environments with branches; `arm64-v8a`, cold cache): setup 34 s, install 13 s, prebuild 2 s, Gradle 654 s, about 11.7 minutes in all, a 94.7 MB APK. The run page showed 13 min 9 s, which adds the gate jobs and the Gradle cache save. The self-hosted M4 Pro is about three times faster.
- APK size, `android-dev` (`arm64-v8a`) on `ubuntu-24.04`, same commit before and after the size settings in [`frontend/mobile/README.md`](../../frontend/mobile/README.md#dung-lượng-apk-android) (runs 38729102565 and 38729105555): 95.2 MB → 40.3 MB. Native libraries 62.0 → 20.3 MB as stored (they were stored uncompressed; 57.5 MB raw after FFmpeg and libarchive were dropped), dex 20.1 → 8.4 MB (R8), resources 8.0 → 6.7 MB, assets unchanged at 4.4 MB. The four-ABI APK (287 MB published from run 38494582573) is no longer built: staging and production now carry only `armeabi-v7a` and `arm64-v8a`, so the APK no longer installs on an x86 (Intel) emulator, and the Play listing no longer offers x86 devices. With both changes, the local build script (now `scripts/android-release.sh`) on the Apple M4 Pro (warm Gradle cache, `armeabi-v7a,arm64-v8a`, R8 on) built the release APK in 3 min 21 s at 58.2 MB: native libraries 20.3 MB (`arm64-v8a`) and 17.9 MB (`armeabi-v7a`) stored, dex 8.4 MB, resources 6.7 MB, assets 4.4 MB. R8 prints `Invalid stack map table` warnings for `play-services-auth`; the build still succeeds.
- Not yet run: `android-staging` and `android-production` (two ABIs, so slower than the dev build), the `self-hosted` and `auto` runner paths, and the APK on a physical device.
- Release signing was checked locally only as far as `./gradlew :app:signingReport` with a throwaway keystore: the `release` variant reports `Config: externalOverride` and that keystore. A full signed build, the `apksigner` check, the R2 upload and the download from `r2.dev` have not run yet. The Play upload is not part of this workflow.
- iOS is not built here (see [mobile-ios-device-release.md](mobile-ios-device-release.md)).
