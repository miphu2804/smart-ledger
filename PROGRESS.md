### 2026-10-28 — A deploy of one service no longer fails on the other's image

| Area | Change |
|---|---|
| Deploy | • `deploy/vps/deploy.sh` reads `AI_IMAGE` and `CORE_IMAGE` into local variables and unsets them before any Compose command, so the empty image the workflow passes for a service this deploy leaves alone no longer overrides the image already named in `.env`<br>• The service loop becomes a `deploy_service` function called once per service, which removes the indirect variable lookup |

Check: the CD staging run of 2026-10-28 02:55 failed with `required variable CORE_IMAGE is missing a value` on an AI-only deploy; reproduced against the real `deploy/vps/compose.yaml` with a stubbed `docker`, where the previous script fails and this one deploys AI only, Core only, both, and neither, leaving the other service's image in `.env` untouched. `shellcheck` and `bash -n` pass. Not verified: a real deploy against the VPS.

### 2026-10-28 — Dopbase on the VPS with a nightly off-site backup

| Area | Change |
|---|---|
| Deploy | • Dopbase, the team's secrets manager, runs as its own Compose project in `/opt/dopbase` behind the shared Caddy, built from the pinned 0.1.10 release and set up only when `DOPBASE_DOMAIN` is set<br>• `deploy/dopbase/backup.sh` stops Dopbase for the copy, tars the `dopbase_data` volume, encrypts it with age for a key the VPS never holds and uploads it to R2; the playbook installs `age` and `rclone`, writes `/opt/dopbase/.env.backup` and adds a 03:00 cron job for user `deploy`<br>• The volume is named `dopbase_data` outright so the backup can mount it by one fixed name<br>• lazydocker 0.25.2 installed from its release for container, log and stats views over SSH |
| Secrets | • `scripts/secrets/dopbase-sync.sh push\|pull <environment>` moves the env files of one environment between `secrets/<environment>/env/` and Dopbase, one project per file |
| Docs | • The CI/CD guide records the Dopbase setup, its backup inputs, the lifecycle retention and the restore steps |

Check: `shellcheck` on both scripts, playbook syntax check, `docker compose config -q`, image build and setup page, sync roundtrip against a throwaway local Dopbase, relative links of the guide resolve. Not verified: the playbook against the VPS, which needs DNS for the Dopbase domain and an operator run, and a real backup and restore. Commit: the merge of this branch.
### 2026-10-28 — CI/CD guide reads as a reference

| Area | Change |
|---|---|
| Docs | • `docs/development/ci-cd.md` is rewritten as short tables, numbered steps and command blocks, from 7,525 to 3,259 words, keeping every fact a reader needs and every anchor other files link to<br>• The stale "No path filtering" limit is removed, since CI filters by path |

Check: every relative link and linked anchor resolves; facts not re-checked against the workflow files. Commit: the squash merge of this branch.

### 2026-10-28 — README reads as tables

| Area | Change |
|---|---|
| Docs | • The README drops the Highlights list and gains Overview, Tech stack, color legend and Getting started tables, so each section scans without reading a paragraph<br>• The Overview lists only what Core and AI do today |

Check: badge URLs resolve (18 checked earlier, Redis removed since no feature reads it); README not rendered on GitHub. Commit: the squash merge of this branch.

### 2026-10-28 — README shows the system architecture and tech stack

| Area | Change |
|---|---|
| Docs | • The README opens with a tech stack badge row, a short summary and highlights, and shows `ci-cd.svg` as the system architecture instead of the older `architecture.svg`<br>• The parts table gains a "Runs on" column and no longer names Railway |

Check: all 18 badge URLs return 200 with a logo; the page was not rendered on GitHub. Commit: the squash merge of this branch.

### 2026-10-28 — Production Core answers on production.103-162-31-93.sslip.io

| Area | Change |
|---|---|
| Deploy | • The production Caddy site serves `production.103-162-31-93.sslip.io` instead of the shorthand `prod.103-162-31-93.sslip.io`, which no client used yet |
| Docs | • The CI/CD guide uses the new name and records that environment names are spelled out, never shortened |

Check: playbook applied for production; `https://production.103-162-31-93.sslip.io/actuator/health` returns 200 `UP` with its own certificate, Core and AI still run `4a4f714`, staging still answers. Commit: the merge of this branch.

### 2026-10-28 — Backend GitHub environments named backend-staging and backend-production

| Area | Change |
|---|---|
| CI | • `deploy-backend` uses environments `backend-staging` and `backend-production` instead of `railway-*`, so their names no longer depend on the host<br>• The new environments carry the same branch rules, production approval, variables and secrets, except `RAILWAY_TOKEN`, which CD does not use |
| Docs | • The CI/CD guide uses the new names and keeps the `railway-*` environments only for a rollback to Railway |

Check: `actionlint`, the deploy key in each new environment matches its public key, and a staging CD run deploys through `backend-staging`. Not verified: production, which switches on the next release to `main`. Commit: the merge of this branch.
### 2026-10-28 — Staging Core answers on staging.103-162-31-93.sslip.io

| Area | Change |
|---|---|
| Deploy | • The staging site of the shared Caddy serves `staging.103-162-31-93.sslip.io` and, until every client has moved, the bare `103-162-31-93.sslip.io`, so both environments carry their name |
| Clients | • Staging web, preview, landing, Android, monitor, load test and release-script defaults use the `staging.` name |

Check: both names answer HTTPS health 200 through the shared Caddy. Commit: the merge of this branch.

### 2026-10-28 — Staging and production share one VPS behind one Caddy

| Area | Change |
|---|---|
| Deploy | • Caddy moves to its own project in `deploy/edge/` (`/opt/smartledger-edge`) that owns ports 80 and 443 and routes `103-162-31-93.sslip.io` to `core-staging` and `prod.103-162-31-93.sslip.io` to `core-production` over the Docker network `edge`<br>• Each environment keeps its own Compose project (`/opt/smartledger`, `/opt/smartledger-production`); Core joins `edge` under `CORE_ALIAS`, AI stays on the project network<br>• Caddy and Core resolve without the VPS search domain, whose wildcard DNS sent `core-production` to an outside host<br>• The playbook runs once per environment and writes `sites/<environment>.caddy` |
| Clients | • Staging web, landing, Android, preview, monitor, load test and release-script defaults point at the VPS instead of Railway |
| Docs | • The CI/CD guide records the shared VPS, its domains and the accepted loss of isolation between staging and production |

Check: playbook applied to the VPS for staging and production; staging HTTPS health 200 through the shared Caddy with the copied certificate, Core reaches AI, production domain gets its certificate and answers 502 until its first deploy. Not verified: a production deploy, which needs the release to `main`. Commit: the merge of this branch.

### 2026-10-27 — Backend on a VPS through GHCR and Caddy

| Area | Change |
|---|---|
| CI | • `deploy-backend` replaces the Railway CLI: it builds `ai` and `core` for `linux/amd64`, pushes them to GHCR with the job's `GITHUB_TOKEN` and runs `deploy/vps/deploy.sh` over SSH with a pinned host key<br>• One package per service and environment, keeping the latest 10 staging or 20 production images as the rollback window |
| Deploy | • The VPS runs `core`, `ai` and `caddy` in one Compose stack; Caddy publishes 80 and 443 with a free Let's Encrypt certificate for `CADDY_DOMAIN` (an sslip.io name until a domain exists)<br>• `deploy/ansible/playbook.yml` provisions a new VPS: Docker, ufw with SSH, HTTP and HTTPS, swap, deploy user and key, env files, Caddy domain, optional GHCR login |
| Docs | • The CI/CD guide and diagram describe the VPS setup and mark Bifrost, Langfuse, pgvector and the Grafana stack as planned |

Check: `actionlint` on both workflows, `docker compose config -q` (fails without `CADDY_DOMAIN` as intended), `bash -n deploy.sh`, playbook YAML parse and diagram validation pass. Not verified: a real deploy, the playbook against a VPS, the certificate, and whether `GITHUB_TOKEN` may delete package versions. Commit: the merge of this branch.

### 2026-10-27 — Root README trimmed, local development page, progress format

| Area | Change |
|---|---|
| Docs | • Root README keeps only status, architecture, layout and links, and says `main` deploys to production<br>• Setup, run, pre-PR checks, Compose, the local database and migrations moved to `docs/development/local-development.md`, grouped by service with one command per block<br>• Links to the old README anchors point to the new page<br>• Repository layout matches the real folders, including `secrets/` and `tools/` |
| Process | • `PROGRESS.md` entries use the table format in CONTRIBUTING, without file lists, and the file stays at 200 lines or fewer |

Check: link and anchor check over the edited files passes. Commit: the one that adds this entry.

### [2026-10-27 19:49 UTC+07:00] — [Fix] Copy env files one way, from staging to this machine

**Done:** `apply.sh dev staging` is removed. It sent a whole target back without knowing which staging version it was built from, so a target older than staging dropped keys a teammate had added (the warning from #376) and also put back old values of keys they had rotated, with no warning at all. Staging is now changed only by editing `secrets/staging/env/` and running `push.sh`, which already refuses to overwrite a newer version; only the maintainer holds the R2 write token for that. `apply.sh dev staging` exits with a message pointing there, and the `sl` Apply item goes straight to staging → dev without the direction picker. `apply.sh staging dev` output is unchanged.

**Changed files:** `scripts/secrets/apply.sh`, `tools/secrets-cli/src/{menu,main}.rs`, `docs/development/secrets-and-env.md`, `secrets/README.md` — modified; this entry.

**Check:** in a scratch repo the old and new `apply.sh staging dev` print the same output and write the same files (create, re-apply with an extra key, `--use-staging`); `apply.sh dev staging` and `sl apply dev staging` exit 1 with the new message; `sh -n` passes; `cargo build --release` and `cargo clippy` pass with no warnings. **Not verified:** the Apply item clicked through in the `sl` menu.

### [2026-10-27 15:26 UTC+07:00] — [Fix] Warn when apply.sh dev staging removes keys from staging

**Done:** `apply.sh dev staging` copies each target as a whole into `secrets/staging/env/`, so a key the target lacks, typically one a teammate added after this machine last ran `apply.sh staging dev`, is removed from staging. The output now prints a warning under the `-` lines that names the target and says to run `apply.sh staging dev` first. Behavior is unchanged; nothing is blocked. The guide's sentence that said it copies only the edited keys now says it copies the whole target.

**Changed files:** `scripts/secrets/apply.sh`, `docs/development/secrets-and-env.md` — modified; this entry.

**Check:** dry runs in a scratch repo: a target missing a staging key prints the warning, a complete target and `staging dev` do not; `sh -n` passes. **Not verified:** the warning inside the `sl` menu.

### [2026-10-27 09:15 UTC+07:00] — [Docs] Refresh the marketing screenshots and keep the capture script

**Done:** The 21 phone-ratio screenshots in `docs/marketing/` dated from 2026-10-12 and no longer matched the app: the tab bar is now Tổng quan · Đơn hàng · Tạo đơn · Trợ lý Bobi · Quản lý, Đọc đơn and Quét mã sit on the Tạo đơn screen, and products without a photo show their initial instead of a stock photo (#193). All 21 were captured again from `staging` at `7d65486` with the same names, size (1170 × 2532 PNG, 390 × 844 at 3x) and flows, so existing links keep working. The capture script is now in the repo (`frontend/mobile/scripts/marketing-screenshots/`, Node 22 and Chrome only, no new packages): it drives headless Chrome over the DevTools Protocol, replaces the camera with a drawn EAN-13 package so the scanner decodes it for real, and types the voice sentences through "Nhập tay". The README lists the new contents, the source commit and how to capture again; the Unsplash note is gone because the app no longer uses those photos.

**Changed files:** `docs/marketing/{dashboard,chat,barcode,voice}/*.png` (21) and `docs/marketing/README.md` — modified; `frontend/mobile/scripts/marketing-screenshots/{capture.mjs,cdp.mjs,page-helpers.js}` — added; this entry.

**Check:** a full run of the script captured all 21 images without errors; each image is 1170 × 2532 and every flow was reviewed on a contact sheet (the chat answer carries the "Số liệu giả lập" note, the scanner reads `8935049500544` and reports `8936079140014` as unknown, the voice order ends at 4 items and 98.000đ); `node --check` passes for the three script files. **Not verified:** the same screens on a real phone; the script on macOS or Linux (paths are configurable but only Windows was run).

### [2026-10-27 01:20 UTC+07:00] — [Feature] Secrets sync: local database, apply, sl menu and one env file per service

**Done:** A dev machine now gets every env file from one command: `scripts/secrets/pull.sh` decrypts `secrets/<env>/env/` from R2, `scripts/local-db.sh` starts the local Postgres with Core and AI migrations, and `scripts/secrets/apply.sh staging dev --apply` writes `backend/core/.env`, `backend/ai/.env`, `frontend/mobile/.env`, `scripts/loadtest/.env.staging` and `scripts/monitor/.env`, with `secrets/local.env.*` put over the staging values. Core and AI keep one file each per environment, `.env.core` and `.env.ai`, equal to the live Railway service variables with references resolved; the separate `.env.railway.core` and `.env.railway.ai` copies are gone. `scripts/secrets/github.sh` sets the GitHub secrets of `railway-<env>` from those files. The `sl` menu (Rust, `tools/secrets-cli`) wraps pull, push, history, apply, members, and admin-only config, migrate and clean.

**Changed files:** `scripts/local-db.sh`, `scripts/secrets/{apply,config,migrate,clean,check,lib,github}.sh`, `tools/secrets-cli/`, `secrets/admins.txt`, `secrets/local.env.{core,ai}`, `secrets/staging/targets`, `secrets/{staging,production}/env.age.dvc`, the three `.env.example` files, `docs/development/secrets-and-env.md`, `secrets/README.md`, `backend/ai/README.md`; this entry.

**Check:** every key of `.env.core` and `.env.ai` in both environments equals Railway; AI and Core started from the applied files against the local database, Core reached readiness and AI accepted Core's internal token; `apply` recreated a deleted target at its path; a fresh clone pulled and applied every target. **Not verified:** a deploy with the `RAILWAY_TOKEN` now set in GitHub; `docker compose` against the local database (containers cannot reach 127.0.0.1).
### [2026-10-26] — [Docs] Synchronize the documentation branch with staging

**Done:** Fetched remote refs and merged `origin/staging` `1228978` into `docs/core-documentation-alignment` for PR #371. The incoming #370 adds the draw.io skill/preset and diagram-guide conventions. Git merged the guide automatically; no conflict needed manual resolution. Retained both the Core audit/renderer notes and staging's added guidance.

**Changed files:** Incoming staging files and the merged diagram guide, plus this new progress entry. The PR's own changes remain documentation/diagram updates; no application code or migration was changed. Pre-existing Zalo Java, frontend lockfile and IDE edits remain outside the merge commit.

**Flow explained:** Refresh staging → merge into the docs branch → check the combined guide, links and source preservation → push the branch to update the existing PR. This is branch synchronization, not merging PR #371 into staging or deploying it.

**Check:** No unmerged paths; staged whitespace check passed. Rechecked documentation inventory: 87 controller routes, 22 Core tables, 14 Mermaid exports, local Markdown links/fragments and all 371 Core source hashes. Unrelated Java/FE file hashes matched their pre-merge values. No image source changed during this merge, so no new renderer or Maven/runtime/UAT result is claimed.

### [2026-10-26] — [Docs] Prepare a separate Core documentation branch for approval

**Done:** Created local `docs/core-documentation-alignment` from refreshed `origin/staging` `d4dc743`, after confirming PR #368 was merged and its tree equals audited feature HEAD `3e93dd1`. Updated the current growth handoff/status to record that merge without claiming deployment or FE acceptance. Prepared the documentation changes for a local commit; push and PR creation await the user's acceptance.

**Changed files:** The accumulated Core documentation and diagram updates listed in the two entries below, plus the growth handoff and current status notes. Only documentation, diagram sources/exports and this append-only entry belong in the commit; pre-existing Java, frontend lockfile and IDE edits stay outside it.

**Check:** Compared feature/staging tree hashes and fetched PR #368 merge metadata. The new branch has no extra API changes relative to its staging base. Documentation/link/schema/render checks from the review follow-up remain the evidence; final staged-file/whitespace and source-preservation checks are required before committing. No push, PR, merge or deploy performed in this preparation step.

### [2026-10-26] — [Docs] Correct FK direction and avatar/inbox scope after review

**Done:** Accepted the three documentation findings. Reversed the DBML draft-to-sale one-to-one declaration so `sale_drafts.confirmed_sale_id` is the FK, matching V4 and DBML's second-column rule. Added the V13 actor-scoped avatar exception to the relationship summary for audit logs. Split avatar and inbox in both Core overview figures: avatar accepts the current ACTIVE OWNER or ADMIN, while inbox requires an ACTIVE OWNER plus recipient/shop ownership and event-visibility checks.

**Changed files:** ERD DBML/description, walkthrough source and its two regenerated overview SVGs, and this new entry. No Java, migration, role policy or runtime change; existing unrelated changes remain intact.

**Check:** Compared with V4/V13, AuthController, MediaServiceImpl, MediaWriteTransactionService, NotificationServiceImpl and NotificationRecipientRepository; checked all four DBML one-to-one declarations. Mermaid 11.12.0 rendered both SVGs locally. Local file/fragment, route/table/declared-column/enum, SVG XML and image-load checks passed; hashes of 371 Core source/test/resource files stayed unchanged and `git diff --check` passed. The earlier inventory alone did not prove relationship direction or guard semantics; those missed cases required this source review. No new Maven/runtime acceptance result, commit or push.

### [2026-10-26] — [Docs] Align Core documentation and diagram exports with branch code

**Done:** Audited Core documentation against `feat/admin-dashboard-growth` at `3e93dd1` (staging base `0e2b1de`). Updated the current module map and migration descriptions; clarified Firebase JSON/ADC/emulator and Compose setup; removed stale phone/OTP wording in ERD notes; completed the dbdiagram layout. Classified target architecture, dated walkthroughs and mock marketing captures separately from implementation/acceptance evidence. No new requirement or BRD/PRD/AC approval is implied.

**Changed files:** Root/Core READMEs, docs index, API contract status notes, technical design, ERD description/DBML/layout, diagram guide, walkthrough source/two Core overview SVGs, four draw.io sources and matching SVGs (plus architecture PNG), marketing README and this new entry. No application code, runtime config, schema or migration changes; pre-existing Zalo/FE/IDE edits were preserved.

**Flow explained:** Canonical API contract → current module/guard map → SQL/ERD ownership → diagrams with explicit scope. New overview diagrams distinguish session/user/profile access, active-shop ledger access, ADMIN guards/audit, Zalo handoff, media/outbox, notifications and Agent proxy. Marketing's hourly report and voice/chat mock captures are not evidence of hourly Core APIs, voice/image parsing or real-provider acceptance. The architecture image is visibly labeled MVP target.

**Check:** Static inventory matched all 87 explicit route-method pairs from 17 controllers to API tables, all 22 Core tables to DBML, 194 declared columns in 19 entities and 13 shared enums. Checked local files/fragments in 24 Markdown documents, 14 Mermaid blocks/exports, all 42 image loads, 19 SVG XML documents and five draw.io embedded-source/cell/edge mappings. Updated exports used local Mermaid 11.12.0/draw.io 28.2.5; contact sheets were reviewed offline. Hashes of all 371 Core source/test/resource files stayed unchanged; `git diff --check` passed. Dated audit evidence is in ignored `backend/core/target/core-docs-audit/`; no new Maven/runtime/UAT result, commit, push, merge or deploy is claimed.

### [2026-10-26] — [Docs] Finish admin growth documentation review

**Done:** CodeRabbit reviewed `9ae18a4`: Javadoc coverage reached 84.78% (80% threshold); PR title/description passed and the Core-exception finding was addressed. Corrected two remaining documentation issues: the active PostgreSQL guidance now says V1–V18, and the growth design keeps implementation decisions while linking API rules to the canonical contract.

**Changed files:** `docs/architecture/technical-design.md`, a CI item in `BLOCKERS.md` and this new entry; no code, schema, configuration or workflow change.

**Flow explained:** The contract owns public date/count/error/audit rules; technical design explains SQL aggregation, transaction boundaries and validation limits. CI on feature HEAD still needs a runner. Manual CI #787 was launched on main and could not start because the repository owner's account is locked by billing; downstream summary also received an empty runner output. GitHub-hosted reruns cannot bypass that billing lock, and the user does not manage the disconnected M4 Pro runners.

**Check:** Compared the remaining findings with current documentation and the prior migrated-DB evidence; `git diff --check` passed. Earlier full Core PostgreSQL verify (1,422 passing cases) and review-follow-up verify (29 passing cases) remain the local evidence; no new test run is claimed for this docs-only follow-up. No merge/deploy or billing/runner administration was performed.

### [2026-10-26] — [Docs] Address admin growth PR review and stale handoff notes

**Done:** Recorded the owner's narrowly scoped Core exception for PR #368 in AGENTS.md; added Javadoc for the ADMIN support API and growth invariants/tests; corrected stale root/Core README and technical-design statements about real FE integration, existing V18 migrations and publication status. No Java behavior, schema, dependency or runtime-setting change. PR title/description and review state are handled on GitHub; no merge or deployment is authorized by this follow-up.

**Changed files:** AGENTS.md, BLOCKERS.md, root/Core READMEs, Core chart handoff, technical design, the seven Java files already touched by the growth feature, and this new entry. Existing Zalo, frontend lockfile and IDE changes were preserved outside the commit.

**Flow explained:** Existing ADMIN read → validated Vietnam date projection → mandatory audit stays unchanged. Source comments now explain this flow and its tests; the PR distinguishes local verification from CI and FE/staging acceptance. The first CI run lost both self-hosted runners before executing steps; artifact quota affected only the optional summary upload, already configured to continue on error.

**Check:** Comment/whitespace-stripped Java comparison against HEAD passed for all seven edited Java files. `mvnw.cmd -B -Dtest=AdminDashboardControllerWebTest,AdminAccessAuditServiceTest verify` passed: 29 tests, zero failures/errors/skips, executable JAR packaged; local log `backend/core/target/admin-growth-pr368-review-verify.log` (ignored). Prior full PostgreSQL evidence remains 1,422 passing testcases on `976be02`; it was not rerun for this comments-only follow-up. New GitHub CI and CodeRabbit results must be read from PR #368 rather than inferred from these local checks.

### [2026-10-26] — [Validation] Complete full PostgreSQL regression for admin growth

**Done:** After Docker recovered, verified committed Core code `976be02` in a clean temporary checkout against a separate disposable PostgreSQL 16.15 container. Resolved the Docker/PostgreSQL validation blocker; no new migration, dependency, environment setting or application-code change in this validation follow-up. No push or deployment.

**Changed files:** `BLOCKERS.md`, `backend/core/docs/admin-dashboard-growth.md` and this new entry. Existing Zalo, frontend lockfile and IDE changes remain outside the feature commits.

**Flow explained:** Temporary PostgreSQL → existing migration/test suites → Maven verify and executable JAR packaging. This checks the committed branch independently of unrelated working-tree edits; FE integration, real Firebase sign-in, staging UAT and realistic growth-query load testing remain pending.

**Check:** `mvnw.cmd -B verify` completed with BUILD SUCCESS in 13:31: 1,422 testcases, zero failures/errors/skips; Maven totals agree with XML testcase counts. Dashboard controller: 22 passed; dashboard PostgreSQL: 18 passed, including the explicit UTC DB-session assertion. Log retained locally at `backend/core/target/admin-growth-full-verify-20261026.log` (ignored). Only a dedicated disposable DB was used; business local/staging/production databases were not used. Push still requires user approval.

### [2026-10-26] — [Feature] Admin daily creation chart API; PostgreSQL rerun pending

**Done:** Added `GET /api/v1/admin/overview/growth` on `feat/admin-dashboard-growth`, with bounded daily OWNER/shop creation aggregates, zero-filled Vietnam dates, active DB ADMIN checks and fail-closed overview audit. Existing overview stays unchanged. Synchronized the approved scope through BR-013/BR-014 → FR-024 → AC-097–AC-100 and the canonical API contract; no new migration, index, dependency or environment variable. Fast-forwarded the feature base to staging `0e2b1de`; no push or deploy.

**Changed files:** Core admin controller/DTO/repository/service, web/PostgreSQL tests, Core README and chart handoff; BRD, PRD/AC, API contract, technical design, document index and this new entry. Existing Zalo callback, frontend lockfile and IDE changes were preserved and are outside this feature.

**Flow explained:** ADMIN authenticates → date range is validated → separate SQL source aggregates join at most 366 dates → the same transaction records ADMIN_OVERVIEW_VIEWED/SYSTEM → response. Series count creation, not activity or historical status; the status chart continues using current overview counts. Canonical field/error/audit rules are in the [growth contract](docs/contracts/api-contracts.md#chuỗi-tạo-mới-theo-ngày--admin-growth); FE chart integration and staging acceptance remain pending.

**Check:** Verified `mvnw.cmd verify` on 2026-10-26: 1,306 reported cases, zero failures/errors, 256 skipped (1,050 executed); `git diff --check` passed. Earlier, 47 targeted tests passed against disposable PostgreSQL on 2026-10-22. The new explicit UTC DB-session assertion and full PostgreSQL rerun are **not verified** yet: Docker Desktop did not expose its Linux engine after a start request. No business/local/staging/production DB was used for this rerun. Static-analysis/CVE/coverage tools are not configured in the Core POM and were not newly installed; no coverage percentage or CVE clearance is claimed. Final push still requires user approval after validation.

### [2026-10-25 21:45 UTC+07:00] — [Docs] CI/CD diagram shows the CI and CD split

**Done:** The pipeline band of the CI/CD diagram now shows `ci.yml` (select-runner with `CI_RUNNER`, changes, the five test jobs), the hand-off by job `cd` with `workflow_dispatch`, and `cd.yml` (select-runner with `CD_RUNNER`, gate, the three deploy jobs, production approval).

**Changed files:** `docs/architecture/diagrams/src/ci-cd.drawio`, `docs/architecture/diagrams/images/ci-cd.svg` (re-exported with draw.io 28.2.5 using the command in `docs/development/ci-cd.md`); this entry.

**Check:** exported a PNG preview and checked the pipeline band: labels fit and do not overlap the icons.
