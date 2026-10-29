### 2026-10-29 — Alerts for the database, AI and Bifrost

| Area | Change |
|---|---|
| Deploy | • Alloy probes each Core's readiness over HTTPS beside liveness, so **Database down** fires when Core is up but cannot reach Supabase<br>• Alloy joins every app network that exists through a `compose.override.yaml` the playbook writes before starting monitoring, and probes `smart-ledger-<env>-ai-1:8001/health` and `smart-ledger-<env>-bifrost-1:8080/health` by container name, since `ai` and `bifrost` exist in both environments; **Service down** fires when either fails for 2 minutes<br>• Alloy gets `dns_search: .` so a stopped container's name cannot resolve through the VPS wildcard DNS |
| Docs | • The CI/CD guide lists the new alerts and how Alloy reaches AI and Bifrost; the VPS network diagram shows the probes and is re-laid out with straight arrows |

Check: throwaway containers with the real Alloy config: readiness 503 with liveness up fired only Database down, Core stopped only Endpoint down; the playbook's monitoring handler under `sh` and `dash` joined Alloy to a test `smart-ledger-staging_default`, the AI probe read 1 and the missing Bifrost 0, and stopping the fake AI raised the Service down series; `ansible-playbook --syntax-check` passes. Not verified: a playbook run on the VPS, and whether production's missing Bifrost starts with it or must be dropped from the probes. Commit: the one that adds this entry.

### 2026-10-29 — VPS network and port diagram

| Area | Change |
|---|---|
| Docs | • New `vps-network.drawio` and its SVG draw the four Docker networks on the VPS as overlapping regions, with the `name:port` each container is reached at, the `edge` aliases Caddy dials, and the Caddy, Core, AI, Bifrost and monitoring flows<br>• The CI/CD guide shows it under VPS with how to read it, and the diagram guide lists it |

Check: networks and members from `docker network inspect` and `docker ps` on the VPS, ports and aliases from `deploy/*/compose.yaml` and the Caddy sites in the playbook; `validate.py` reports 0 errors and the SVG was read on a light and a dark page. Commit: the one that adds this entry.

### 2026-10-28 — Web deploys check the real domains

| Area | Change |
|---|---|
| Deploy | • `deploy-web.yml` names `app-production.songheloi.id.vn` and `app-staging.songheloi.id.vn` in the GitHub environment URL and in the smoke test, instead of the Vercel domains the project no longer lists in `CORS_ALLOWED_ORIGINS`<br>• `app-staging.songheloi.id.vn` carries the git branch `staging` in its Vercel domain settings, so a `main` deploy no longer takes the alias |
| Docs | • The CI/CD guide names the same domains in the release steps, the staging CORS list, the production checklist and the Vercel event table, and records why the staging domain needs its branch |

Check: the production CD run of 2026-10-28 12:17 failed its smoke test with `Core CORS does not allow https://smart-ledger-prod.vercel.app`, and the production deploy had taken `app-staging.songheloi.id.vn`; after the branch was set and CD staging web re-run, `app-production` serves the production bundle and `app-staging` the staging one, each allowed by its own Core. `actionlint` reports only the pre-existing `SC2034` of the smoke test step. Not verified: the next production deploy keeping its hands off the staging alias.

### 2026-10-28 — Zalo sign-in tested on a phone; clearer config error

| Area | Change |
|---|---|
| Mobile | • A Firebase custom token from another project (`auth/custom-token-mismatch`, `auth/invalid-custom-token`) now reads "Cách đăng nhập này chưa dùng được lúc này. Vui lòng chọn cách khác hoặc thử lại sau" with the code, instead of "Vui lòng thử lại", since retrying cannot fix it |
| Test | • Zalo LOGIN on Android passed against staging Core on a Samsung SM-A528B (Android 14): `POST /auth/zalo/native/exchange` 200, Firebase custom token sign-in, `POST /auth/session` 200 as OWNER<br>• The APK was hand-repacked: the JS of #399 on a dev build with Firebase `smart-ledger-c2892`, signed with the debug key. Its App Link still named the old Railway host, so the return link was passed to the app over `adb` from the browser's DevTools<br>• A first try on a production-based APK failed with `auth/custom-token-mismatch`: native Firebase reads `google-services.json`, which pointed at `smart-ledger-production` while staging Core signs for `smart-ledger-c2892`. Test Zalo only with an APK whose Firebase project matches the Core |

Check: `npx tsc --noEmit` and `npm test` (frontend/mobile); app log on the phone with `debugLog` turned on in the test bundle only. Not verified: the App Link opening the app by itself, which needs a CI APK built from `staging`, and iOS. Commit: the one that adds this entry.

### 2026-10-28 — No divider under the last row of a list

| Area | Change |
|---|---|
| Mobile | • `SettingRow` takes `last`: the last row of each card in Settings and Notification settings no longer draws a line just above the card edge (reported by Phú)<br>• Same fix for the last item at checkout, the last debt history entry, the last conversation in the assistant history, the last product in the add-item sheet and the last pending expense in voice orders |

Check: `npx tsc --noEmit` shows only the two existing errors for the missing `expo-application` and `expo-intent-launcher`; Settings, Notification settings and debt history checked on the mock web build (the last history row measures `0px` border). Not verified on screen: checkout, assistant history, the add-item sheet, voice expenses, and a real phone. Commit: the one that adds this entry.

### 2026-10-28 — Admin uses the Bobi logo and a brand login page

| Area | Change |
|---|---|
| Web | • The admin sidebar, login and 403 pages show the Bobi notebook logo from the landing instead of the grey microphone mark; the sidebar subtitle reads "Trang quản trị"<br>• The login page uses the brand purple: a purple panel with a waving Bobi (the mobile `bobi-tab-v2.png` as a 560 px webp, 36 KB), a heading and three points that hold with the real Core (search, shop status history, audited reads), and a purple button, checkbox and focus ring<br>• On phones the purple panel hides and the card shows the logo; the placeholder email no longer has a misspelled domain |

Check: `npm run typecheck` and `npm run build` pass; `npm run lint` shows only the four warnings that #381 fixes; login, the dashboard sidebar (open and collapsed), the 403 page and the phone layout checked in the browser on a mock build. Not verified: a build against the real Core. Commit: the one that adds this entry.

### 2026-10-28 — Web admin lint warnings cleared

| Area | Change |
|---|---|
| Web | • `npm run lint` in `frontend/web` reported six warnings in the admin code and now reports none<br>• `colorFor` and `initialsOf` in `components/admin/ui.tsx` are no longer exported, so the file exports only components<br>• Four `useEffect`s that set state right away follow React's pattern: the phone menu remembers the page it opened on and closes on navigation without an effect; quick search clears old results and shows "Đang tìm…" from the input handler; AI Support copies newly loaded conversations during render; the create-task dialog resets its form during render when it opens, and its effect only loads shops and members |

Check: `npm run lint` shows no warnings; `npm run typecheck` and `npm run build` pass. Mock admin at 375 px: the menu opens, closes when a page is chosen and on the backdrop; quick search shows "Đang tìm…" then results, closes at 1 letter; AI Support lists its 3 conversations; the create-task dialog opens empty with 58 shops and again after cancelling. Not verified: the admin against real Core. Commit: the one that adds this entry.

### 2026-10-28 — Zalo sign-in button works again

| Area | Change |
|---|---|
| Mobile | • The Zalo button on the sign-in screen signs in again when the build carries Zalo settings (`EXPO_PUBLIC_ZALO_NATIVE_CLIENT_ID` on Android, `EXPO_PUBLIC_ZALO_LOGIN=true` on the web); iOS and builds without them still show "Sắp có"<br>• The `android-dev` and `android-staging` builds and the `vercel-staging` web build already set these, so their button turns on; production does not<br>• The mobile README says when the button is on |

Check: `npx tsc --noEmit` shows only the two existing errors for the missing `expo-application` and `expo-intent-launcher`; `npm test` fails only the two existing cases in `parseOrder` and `quickNav`; staging Core answers `400 invalid_zalo_request` (feature on) to a malformed request on both Zalo authorize endpoints and serves `assetlinks.json` with the certificate of CI test APKs, while production answers `503 zalo_unavailable`. Not verified: a full Zalo sign-in on a phone. Commit: the one that adds this entry.

### 2026-10-28 — A deploy of one service no longer fails on the other's image

| Area | Change |
|---|---|
| Deploy | • `deploy/vps/deploy.sh` reads `AI_IMAGE` and `CORE_IMAGE` into local variables and unsets them before any Compose command, so the empty image the workflow passes for a service this deploy leaves alone no longer overrides the image already named in `.env`<br>• The service loop becomes a `deploy_service` function called once per service, which removes the indirect variable lookup |

Check: the CD staging run of 2026-10-28 02:55 failed with `required variable CORE_IMAGE is missing a value` on an AI-only deploy; reproduced against the real `deploy/vps/compose.yaml` with a stubbed `docker`, where the previous script fails and this one deploys AI only, Core only, both, and neither, leaving the other service's image in `.env` untouched. `shellcheck` and `bash -n` pass. Not verified: a real deploy against the VPS.

### 2026-10-28 — Compose projects on the VPS are named smart-ledger

| Area | Change |
|---|---|
| Deploy | • `deploy/vps/compose.yaml` and `deploy/edge/compose.yaml` set `name:`, so the projects are `smart-ledger-staging`, `smart-ledger-production` and `smart-ledger-edge` instead of being named after their directories<br>• `deploy/vps/deploy.sh` and `deploy/ansible/playbook.yml` write `ENVIRONMENT` to the project `.env`, which `compose.yaml` interpolates into the name; the app directories and `VPS_APP_DIR` are unchanged<br>• `deploy-backend.yml` forwards its `DEPLOY_ENV` to `deploy.sh` as `ENVIRONMENT` |
| Docs | • The VPS section of `docs/development/ci-cd.md` lists each environment's Compose project and records that renaming a project needs the old project taken down and the Caddy certificate volume copied first |

Check: `docker compose config` resolves `smart-ledger-staging`, `smart-ledger-production` and `smart-ledger-edge`, and fails when `ENVIRONMENT` is unset; `shellcheck` and `bash -n` pass on `deploy.sh`; `ansible-playbook --syntax-check` passes. The VPS itself is not migrated yet. Commit: the squash merge of this branch.

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
