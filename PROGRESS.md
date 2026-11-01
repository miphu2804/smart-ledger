### 2026-11-01 — Playwright covers the main mobile flows

| Area | Change |
|---|---|
| Test | • `e2e/` gains specs for sign-up, sales and payment, invoices, products, debts, expenses, home and reports, notifications, and account (#439 to #448), with shared steps in `e2e/helpers.ts` |

Check: `npx playwright test` twice in a row, 23/23 both times on the mock web build with a cleared cache; `npx tsc --noEmit` passes; no app bug found. Not covered: real Core, a real phone, voiding an order, stock-in, paying a debt in full, deleting an expense, clearing all notifications. Commit: the one that adds this entry.

### 2026-11-01 — OpenAI native and Inception through Bifrost, Anthropic path removed

| Area | Change |
|---|---|
| AI | • Every chat turn on staging failed with Bifrost 401 because the Anthropic SDK sends the virtual key as `x-api-key`, which Bifrost accepts only for `sk-bf-` keys; the OpenAI clients now send it in `x-bf-vk` on the client, since a run's `extra_headers` replace the model's whole<br>• `ModelAlias` gains `effort`, and `MODEL_REASONING_EFFORT` is the default for an alias without one; the default alias is `chat` on `gpt-6-luna` over `openai_responses` with effort `high`<br>• `anthropic_messages`, `AnthropicMessagesProvider`, `ANTHROPIC_BASE_URL`, the `anthropic` extra, `SUMMARY_MODEL_NAME` and the `x-opencode-session` and `x-bf-eh-*` headers are gone; `openai_chat` stays for Mercury |
| Deploy | • `bifrost.json` serves `gpt-6-luna` from `openai` and `mercury-3` from a custom `inception` provider (key `INCEPTIONLABS_API_KEY`), `vk-ai` allows exactly those two, both retry once after 500 ms, and the OpenCode Go providers and routing rules are removed; no alias calls Mercury 3 yet, since it is untested<br>• The credential map was regenerated |
| Docs | • ADR-0008 update, AI README, technical design, CI/CD, the memory diagram and the policy and Data safety pages name OpenAI and Inception |

Check: `uv run pytest` 460 passed, ruff check and format pass; a local fake gateway received `x-bf-vk`, `x-bf-session-id`, `x-bf-lh-shop-id` and the per-alias effort (`high` on `/responses`, `instant` on `/chat/completions`); `bifrost.json` parses; `tsc --noEmit` and `tsc -b` pass on the web app. A local Bifrost v2.3.2 loaded `bifrost.json` and served both models; Bifrost ignores a `BIFROST_VIRTUAL_KEY` without the `sk-bf-` prefix and makes its own, so every header then fails with 401 `access not found`. Not verified: Mercury 3 quality (no alias calls it), staging, or whether the staging virtual key has the `sk-bf-` prefix. Production keeps the older image and OpenCode Go. Commit: the one that adds this entry.

### 2026-11-01 — snooplog runs from any shell

| Area | Change |
|---|---|
| Deploy | • `snooplog` is a script in `/usr/local/bin` instead of an alias in `/etc/profile.d`, so tmux panes and other non-login shells can run it; the filter is unchanged |
| Docs | • `ci-cd.md` calls it a command, not a shortcut |

Check: `ansible-playbook --syntax-check` passes and the patch applies cleanly to `staging`; not run on the VPS yet, so the tmux case is inferred. Commit: the one that adds this entry.

### 2026-11-01 — Policy and account deletion links in the app

| Area | Change |
|---|---|
| Mobile | • Quản lý has "Chính sách và điều khoản" and "Xoá tài khoản", and the sign-in screen links the policy; they open `/chinh-sach` and `/delete-account` on the public site, which Google Play requires for account deletion |
| Web | • The policy and the data deletion page say the request can start in the app; Minh Thọ is named as the owner of the legal content |
| Docs | • `docs/product/google-play-data-safety.md` holds the answers for the Play Console form, matched to the policy, including what #467 sends to HoneyHive<br>• PRD `AC-110`; the multi-shop criterion moves to `AC-109`, because `AC-104` was already CORE-019's |
| Test | • `e2e/legal-links.spec.ts` checks the three links<br>• `test:e2e` now starts Metro with `--clear`: with `node_modules` shared between worktrees the cached router path served another worktree's screens, so the check recorded for #461 did not hold |

Check: `npx playwright test` 4/4 with a cleared cache, on the code of #420, #421, #458, #459, #460 and #461 together; `npx tsc --noEmit` passes; unit tests 182/184, with `parseOrder` and `quickNav` failing on `staging` too; web lint, `tsc -b` and `vite build` pass. Not verified: a real phone, the Data safety answers against the production AAB, and Minh Thọ's review. Commit: the one that adds this entry.

### 2026-11-01 — HoneyHive replaces Logfire for AI traces

| Area | Change |
|---|---|
| AI | • `src/observability.py` sends Pydantic AI spans to HoneyHive when `HH_API_KEY` is set, with message and tool content but no raw media (`NFR-008` now allows it); `InputRedaction` runs before the session opens, so the question, history and memory reach HoneyHive redacted<br>• Each chat turn is one HoneyHive session: it opens with the redacted question, `user_id`, `shop_id`, model and `prompt_version` (12 hex characters of the instructions' SHA-256), and closes with the answer and token counts; the calls run in the background, so the owner never waits on HoneyHive; tracing starts in `lifespan`, not at import, so tests (which clear `HH_API_KEY`) send nothing; on shutdown `lifespan` waits for memory writes and session updates, then flushes queued spans<br>• INFO and WARNING logs keep only tool names, call ids, sizes and error codes; SQL, tool results, error reasons and memory tracebacks log at DEBUG; session updates wait for the session to exist; `prompt_version` also hashes the tool definitions<br>• `AppConfig` gains `HH_API_KEY`, `HH_API_URL`, `HH_SOURCE`; `logfire`, `redis`, `REDIS_URL` and `LANGFUSE_*` are gone<br>• `evaluation/agent_chat` scores the real agent on 21 questions of a made-up shop, 3 times each; the seed sells at 00:30 and 23:30 shop time and has discounts, voided sales, repaid debts and an archived product, number cases must match SQL exactly, and a model judges the low-stock, out-of-scope and top-product cases; each run records model, `prompt_version` and `suite_version`<br>• `evaluation/honeyhive` holds two online Python evaluators, `query-error` on `query_shop_data` calls and `internal-leak` on each session's answer, and three daily alerts on a p95 turn above 20 seconds, a query error rate above 20% and more than five failed turns, all applied by `apply.py`<br>• A failed, timed-out or cancelled turn marks its session `metadata.error`; sessions carry `git_sha` and, when streamed, `first_text_ms`; `HH_SAMPLE_RATE` traces a share of turns; memory spans carry `shop_id` and embeddings are traced; a refused session logs a warning, and shutdown waits for session updates before the flush and then stops the tracer<br>• `first_text_ms` counts from the turn's arrival, memory recall included, and covers turns that stream nothing; session updates run on two HoneyHive threads instead of the default pool; the SDK's warning for each span of an unsampled turn is filtered; the alerts watch `source` `production` only |
| Deploy | • The workflow and compose file no longer write `github.ai.env` or `REDIS_URL`; the `HH_*` values come from Dopbase `ai/<environment>`; `deploy-backend.yml` builds the deployed commit into the AI image as `GIT_SHA`; the VPS compose file gives the AI container 60 seconds to stop, so a flush is not killed at Docker's 10-second default |
| Web | • The `/chinh-sach` policy page names HoneyHive and what it receives in the AI section and the processor list, and drops Redis Cloud |
| Docs | • ADR-0009 accepted for the AI side; AI README, technical design, CI/CD and env guides, service walkthrough, the architecture and CI/CD diagrams and the credential map name HoneyHive and Bifrost and drop Redis and Langfuse |

Check: `uv run pytest` (459 passed, including a turn outside the sample leaving no SDK warning, session updates off the default pool and the first-words timer, plus concurrent turns keeping their own sessions, failed and cancelled turns marking their session, and every fake tracer call binding to the real SDK signature) and ruff passed; real turns on the local database reached HoneyHive with their session, model and tool events, the local capture found the content in the OTLP bytes with email and card numbers redacted; the evaluation (suite `526027def191`, prompt `c0447592b804`) passed all 62 recorded turns of 63, and one turn dropped on a network `ReadError`, which the run reports as a failure; the judge passed the right answers and failed the four wrong ones that the earlier regex scoring accepted, and each seed trap changes the expected figure; both online evaluators are on the HoneyHive project, scored stored and crafted events correctly on HoneyHive's server, and scored a new local chat turn within about two minutes; a local turn then showed `git_sha`, `first_text_ms` and memory spans with `shop_id`, a timed-out turn showed `metadata.error = answer_timeout`, and a session closed three seconds late with leaked SQL scored `internal-leak = True`; the three alerts were deleted in the HoneyHive UI and recreated by `apply.py` with the `production` filter, and have not run yet; `tsc --noEmit` passed on the web app. Dopbase `ai/staging` and `ai/production` hold `HH_API_KEY`, `HH_API_URL` and `HH_SOURCE` and no longer hold `LOGFIRE_*`, `REDIS_URL` or `LANGFUSE_*`, and the credential map was regenerated; neither environment is deployed yet, and `evaluation/agent_chat/results/` stays out of Git. Commit: the one that adds this entry.

### 2026-10-31 — Create a second shop and switch between shops

| Area | Change |
|---|---|
| Mobile | • Tapping the shop name in the quick menu lists the account's shops and "Tạo cửa hàng mới"; `app/shop-new.tsx` takes a name and industries<br>• The app always used the first shop; the store now keeps the list, picks the last shop chosen on this device and skips suspended shops, which show as "Tạm ngưng" and cannot be chosen<br>• Switching rebuilds the tabs from `shopId` and clears the cart and draft; the bank account is stored per shop, and the old single account goes to the first shop |
| Docs | • PRD `FR-011` and `AC-104` |

Check: 7 new tests pass; all mobile tests 164/166, with `parseOrder` and `quickNav` failing on `staging` too; `npx tsc --noEmit` passes; a temporary Playwright run on the mock web build signed up, created two shops, switched both ways and kept each shop's bank account with no console error; the cart cleared on switching in a browser check. Not verified: real Core, data separation between shops (mock data is shared), reopening the app on the chosen shop, and a real phone. Commit: the one that adds this entry.

### 2026-10-31 — In-app screens need a signed-in session

| Area | Change |
|---|---|
| Mobile | • `/ai` and the other screens outside the tabs opened without signing in, and `/ai` greeted the visitor with the sample name "Lan"; a 401 in chat then only showed "Chưa gửi được tin nhắn", because `forceSignOut` navigates only when the app was signed in<br>• The root stack puts those screens in `Stack.Protected`, open only once the session is restored, signed in and with a shop; otherwise they go to the splash and then sign-in<br>• `src/lib/authGate.ts` lists the screens and `tests/authGate.test.ts` fails when a new screen in `app/` is not on the list |

Check: 2 new tests pass; `npx tsc --noEmit` passes; on the mock web build `/ai` signed out lands on `/welcome` without "Lan", and signed in Bobi opens. Not verified: a 401 from real Core and a real phone. Commit: the one that adds this entry.

### 2026-10-29 — Shop and profile fields check their format

| Area | Change |
|---|---|
| Mobile | • `src/lib/profileValidation.ts` checks the edit-profile fields: Facebook link must be a `facebook.com`, `fb.com` or `fb.me` link without spaces; bank account digits only, 6–19; shop phone a Vietnamese number (0 or +84, or a 1800/1900 hotline); stricter email; bank name letters, digits, spaces and a few marks such as `,` and `/`; bank name and account go together; name, shop name and address need letters or digits<br>• Each field shows its error and the save button stays locked until all pass, except a value saved earlier and not edited, so old data does not lock the form; length limits follow Core (shop name 200, phone 30, address 500); the create-shop step checks the shop name the same way |
| Test | • `tests/profileValidation.test.ts` covers the tester's inputs (`dsa mipu gfd.,!@#$%^&*()`, a phone of dots, `324253432dsa2`) and valid ones |

Check: 16 new tests pass; all mobile tests 173/175, the two failures in `parseOrder` and `quickNav` exist on `staging`; `npx tsc --noEmit` passes; on the mock web build the three tester inputs show errors with save locked, and valid values unlock it. Not verified: a real phone. Commit: the one that adds this entry.

### 2026-10-31 — Playwright for the mobile web build

| Area | Change |
|---|---|
| Test | • `npm run test:e2e` starts the Expo web build with mock data on port 8090 and runs `e2e/` in Chromium at a phone viewport (#438)<br>• `e2e/smoke.spec.ts` opens the sign-in screen, enters with the mock account and checks Tổng quan with no page error |
| Docs | • The mobile README says how to install and run it |

Check: the smoke test passes through `npx playwright test`; it failed first without `EXPO_PUBLIC_API_ENDPOINT`, so the config sets it; `npx tsc --noEmit` passes. Not run in CI, which the issue does not ask for. Commit: the one that adds this entry.

### 2026-10-31 — Policy page for Google Play

| Area | Change |
|---|---|
| Web | • `/chinh-sach` carries the privacy policy, terms of use and payment policy from the team's Google Doc dated 30/10/2026, with its open details filled from the deploy config and code: AI providers, log retention, what is really collected<br>• `/delete-account` opens the data deletion page, the footer links to the new page, and `/privacy` redirects to it, so one privacy policy remains<br>• The draft label is gone from the legal pages, with `VITE_LEGAL_DRAFT` in the code, the landing workflow and the docs |

Check: `npm run lint`, `tsc -b` and `vite build` pass; at 375 px the page has no horizontal scroll and no draft or "Cần điền" text, and `/privacy` redirects to it. Not verified: legal review. The app still has no in-app account deletion entry, which the page says plainly and Google Play requires. Commit: the one that adds this entry.

### 2026-10-29 — Tab screens end above the tab bar

| Area | Change |
|---|---|
| Mobile | • `src/tabBar.ts` holds the tab bar height (100) and the space a tab screen leaves at its end (124); the tab bar drew 100 above the screen edge whatever the bottom inset, but each screen reserved its own number<br>• Quản lý reserved 96, so "Phiên bản 1.0.0" sat under the bar; Đơn hàng reserved 108 and Tạo đơn `insets.bottom + 96`, both short on devices without a bottom inset; all three, and the Tạo đơn cart bar, now use the shared values |

Check: `npx tsc --noEmit` passes; on the mock web build at 375×812 the end of Quản lý, Đơn hàng ("Đã hiện hết 6 đơn") and Tạo đơn with one item in the cart sit above the tab bar. Not verified: a real phone, and a phone with 3-button navigation, where the bar's labels may sit under the system buttons. Commit: the one that adds this entry.

### 2026-10-31 — Bruno collection for the Core API

| Area | Change |
|---|---|
| CI | • CD job `smoke-staging` runs the read-only `Smoke` folder after each staging backend deploy; a failure marks the run without rolling back |
| Docs | • `scripts/bruno` adds Bruno requests for the Core API in OpenCollection YAML with `local` and `staging` environments, Firebase login and a read-only `Smoke` folder<br>• Production has no environment because most requests write data |

Check: `bru run Smoke --env staging` passed 4 of 4 assertions; 65 of the 87 requests returned 2xx or their expected status in OWNER and ADMIN flows against local Core, PostgreSQL and the Firebase Auth Emulator; the 22 media, Zalo and Agent requests were not run because they need Cloudinary, Zalo or AI. Commit: the squash merge of this branch.

### 2026-10-31 — Durable operation quotas (CORE-019)

| Area | Change |
|---|---|
| Core | • Owner-approved V20 adds private quota windows and leases; commit-based media/shop limits survive restart and share state across instances<br>• Replay remains free at capacity, failures release pending slots and completion rolls back with business/audit/idempotency; default-off flag, native proxy handling and CORS Retry-After |
| Docs | • BR-024 → FR-037 → AC-104–108, API contract, ERD and rollout/recovery guide capture the approved policy and separate local verification from shared-environment activation |

Check: full Maven verify passed 1472 tests on disposable PostgreSQL 16.15 with zero failures/errors/skips; the execution gate passed all 17 required PostgreSQL suites and its 13 unit tests passed. DBML parser and 12 new local links/anchors passed; Core code/tests/migrations remain unchanged after staging integration. Credential map regeneration was attempted but Dopbase CLI is unavailable locally. Shared-DB migration, feature activation and real Caddy/FE/provider acceptance are not verified. Commit: the one that adds this entry.

### 2026-10-30 — LLMFactory, provider classes and Bifrost routing

| Area | Change |
|---|---|
| AI | • `LLMFactory.create_model(alias)` replaces `build_chat_model`; `OpenAIChatProvider`, `OpenAIResponsesProvider` and `AnthropicMessagesProvider` each own one protocol, and `MODEL_ALIASES` replaces `MODEL_PROVIDER` and `MODEL_NAME`<br>• `session_settings` moves to its own module, takes the shop and sends the `x-bf-*` headers Bifrost needs for session grouping, log metadata and forwarding<br>• `MODEL_FALLBACKS` stays, in `protocol:model` form, until production runs Bifrost |
| Deploy | • `bifrost.json` splits OpenCode Go into an Anthropic and an OpenAI custom provider, adds OpenAI for the Luna fallback and routing rules, and stores logs for 14 days without message content (NFR-008) |
| Docs | • AI README, technical design, CI/CD guide, service walkthrough and ADR-0008 describe the aliases and Bifrost owning routing and fallback |

Check: `uv run pytest` passes with 442 tests and `uv run ruff check` passes. The pinned Bifrost v2.3.2 image was run against a mock upstream: Anthropic requests reach `/v1/messages` with `cache_control`, session and User-Agent are forwarded, a 429 falls back to OpenAI, and logs show the session, shop and rule without content. Not verified: real OpenCode Go and OpenAI calls, tool calls and streaming through Bifrost, and the Bifrost UI itself. Commit: the one that adds this entry.

### 2026-10-31 — Dozzle and Snoopy for VPS operators

| Area | Change |
|---|---|
| Deploy | • The monitoring stack runs Dozzle `v11.4.0` for live container logs, bound to `127.0.0.1:8081` with a 64 MiB limit and reached through an SSH tunnel<br>• The playbook installs Snoopy, accepting its `ld.so.preload` prompt, and adds the `snooplog` shortcut |
| Docs | • The CI/CD guide describes the tunnel, why Dozzle gets no Caddy site, and what Snoopy can and cannot prove |

Check: a manual Dozzle container on the VPS listed all 13 containers through the tunnel, `docker compose config` accepted the service, `ansible-playbook --syntax-check` passed and the Snoopy debconf key matches the installed package. Not verified: a real playbook run, or the preseed on a new VPS.

### 2026-10-30 — Alerts as Discord embeds and Telegram messages

| Area | Change |
|---|---|
| Deploy | • `templates.yaml` builds each alert group once for both channels: headline with state, severity, alert, environment and count, one summary per alert, then Environment, Severity, Vietnam time and Source, then Overview, Silence and Alert rules links<br>• Discord gets a coloured embed with fields and Telegram an HTML message, both through Grafana's webhook integration; the chat ID rides in the Bot API URL because Grafana turns a chat ID read alone from the environment into a number<br>• The contact point is now `smartledger`; provisioning deletes the old `discord` one, and the playbook requires and writes `MONITOR_TELEGRAM_BOT_TOKEN` and `MONITOR_TELEGRAM_CHAT_ID` |
| Docs | • The CI/CD and secrets guides describe both channels and the bot setup; the credential map lists the two keys |

Check: on Grafana 12.1.1 provisioned from the repository, an upgrade from the old `discord` contact point kept 7 rules and the policy; test alerts reached a capture server as a Discord embed and a Telegram HTML body, and the template test rendered firing, two-alert and resolved groups; a real `sendMessage` with the chat ID in the query and a JSON body was accepted. Not verified: a real alert on the VPS.

### 2026-10-30 — Product analytics dashboard with cohort retention (ADR-0003 P1)

| Area | Change |
|---|---|
| Deploy | • Grafana provisions read-only PostgreSQL datasources `smartledger-staging-pg` and `smartledger-production-pg` (one connection, closed after each query) and the **SmartLedger product** dashboard in a Product folder: DAU, WAU, MAU, stickiness, weekly cohort retention, activation funnel, feature adoption, AI use, sales and data freshness, plus an Events row; load-test accounts are left out<br>• `vps-playbook.sh` loads the `monitor` group; the playbook refuses any login other than `grafana_reader` and writes `postgres-<environment>.env`, which Compose reads as optional files so each environment keeps the other's datasource |
| Config | • `.env.example` of Core and AI and the Dopbase templates carry the pooler budget: Hikari 8, AI pools 2 and 2, so Core, AI and Grafana use 13 of 15 session pooler clients; Hikari keeps 2 connections while idle and fails a request after 5 s without a free connection instead of 30 s |
| Docs | • ADR-0003 now records one dashboard instead of two, retention and stickiness definitions, why logout is not a metric, and login tracking as a P2 Core change; the CI/CD and secrets guides describe the datasource and its login; the credential map is regenerated |

Check: on a throwaway PostgreSQL 16 with every Core migration, the AI chat table and the `grafana_reader` grants from the ADR, every SQL query of the dashboard ran through Grafana 12.1.1 provisioned from the repository and rendered in the browser; the grants alone were enough after the last-sale panel moved from `created_at` to `sold_at`; `ansible-playbook --syntax-check` and `docker compose config` with one optional file present pass. Not verified: the role on Supabase, the pooler login, real data and the AI Prometheus panels; Dopbase now holds Hikari 8, minimum idle 2 and a 5000 ms connection timeout for Core, 2 and 2 for AI's pools, and port 5432 and database `postgres` in `monitor/staging` and a new `monitor/production`; `GRAFANA_PG_HOST`, `GRAFANA_PG_USER` and `GRAFANA_PG_PASSWORD` are not set for production and were not checked for staging, because reading values needs an interactive password. Commit: the one that adds this entry.

### 2026-10-30 — Caddy reads its Caddyfile through a directory, and a scrape-down alert

| Area | Change |
|---|---|
| Deploy | • The shared Caddy mounts `conf/` instead of the single `Caddyfile`: Ansible replaces a file by rename, a single-file mount keeps the old inode, and `caddy reload` had kept serving the Caddyfile from before #422, so `:9180` never opened and the Overview showed only probes<br>• The edge handler runs `caddy validate` before `caddy reload`, and the playbook removes the old top-level `Caddyfile`<br>• Grafana alert **Metrics scrape down** fires when a target's `up` is 0 for 10 minutes<br>• Grafana opens on the Overview after sign-in, and the Resources dashboard shows every container in one view without the stack filter |
| Docs | • The CI/CD guide explains the directory mount, lists the new alert and describes the Resources and home dashboard changes |

Check: on the VPS, the container's `/etc/caddy/Caddyfile` had no `9180` while the host file did, and `up{job="caddy"}` was 0 for 24 hours; locally, Caddy started from the new layout served `:9180` and, after the Caddyfile was replaced by rename, `caddy reload` picked up the change; the playbook passes `--syntax-check`; a throwaway Grafana 12.1.1 provisions the eight alerts, opens on the Overview and loads the Resources dashboard; on the live Prometheus `1 - up > 0` returns Caddy and production AI. Not done: the playbook has not run on the VPS, and production AI still fails its scrape until a release carries `/metrics`. Commit: the one that adds this entry.

### 2026-10-29 — Credential map pages for staging and production

| Area | Change |
|---|---|
| Docs | • `docs/development/credential-map/` holds one page per environment listing every Dopbase and GitHub variable with its source, service, connection, kind, status, code references and the failure it causes, shown as a table grouped by service with a status strip, search, a service filter and a detail panel<br>• `scripts/secrets/credential_map.py` builds the pages from Dopbase key names and a scan of tracked files; connections, kinds and verified symptoms live in `scripts/secrets/credential-map.json` |

Check: both pages generated (staging 208 keys, production 179); every local env value of 12 or more characters was searched for in the pages and only the VPS IP, already public in the docs, matched; both pages were opened in the in-app browser at 1440 px and 375 px with no horizontal page scroll and no console errors, and env template files under `secrets/templates/` are skipped by the scan so they do not mark every variable as used. Commit: the one that adds this entry.

### 2026-10-29 — R2 bucket, token policy and key handling for the Dopbase backup

| Area | Change |
|---|---|
| Docs | • A new `dopbase-secrets-and-backup` diagram shows the three bands — operator and CI, the VPS, and R2 — with who writes secrets in, what the nightly cron does, and where each key lives<br>• The CI/CD guide now says how to create the backup bucket: the bucket and its location hint, a lifecycle rule for retention and incomplete uploads, an R2 API token scoped to that bucket from the R2 page rather than the account API token page, a bucket policy that denies delete because R2 has no write-only preset, and the age key pair generated off the VPS and kept in the password manager<br>• The five backup variables belong in both `vps/staging` and `vps/production`, because a playbook run for an environment without them removes the cron job the other environment's run created<br>• A hand run of `backup.sh` plus a refused `rclone delete` is the check that the bucket is set up right |

Check: a link and anchor pass over `docs/development/ci-cd.md` resolves every link and image added here; the diagram exports with the repository's own drawio flags and was read back as a PNG to check for overlapping labels and edges through nodes; `backup.sh` keeps the volume-tar approach, because `dopbase backup` reaches an administrator-only endpoint and a cron job would have to hold an admin token on the VPS. Not verified against Cloudflare: that R2 accepts `s3:PutBucketPolicy` in a bucket policy, the Asia-Pacific location hint, and the refused delete; no bucket, token or key pair exists yet. Two anchors that predate this change, `#android-runners` and `#ci-runners`, are still broken. Commit: the one that adds this entry.

### 2026-10-29 — Layered Grafana dashboards with Core and AI request metrics

| Area | Change |
|---|---|
| Deploy | • Grafana provisions three dashboards in Infra, read-only in the UI: **SmartLedger overview** (health, alerts, per-service RED), **SmartLedger service** (one service's RED, probe, container and logs) and **SmartLedger resources** (VPS and containers by stack), linked by the `smart-ledger` tag<br>• The shared Caddy serves per-host request metrics on `:9180`, unpublished; Alloy joins `edge` to scrape it and labels each probe with its `host`<br>• Prometheus loads recording rules that turn Caddy's metrics into `service:http_requests:rate5m` and `service:http_request_duration_seconds_bucket:rate5m` by `env` and `service`, so a new source adds rules and no dashboard changes<br>• AI exposes `/metrics` with request count, status class and latency per route up to 120 s, without `/health`; the playbook lists each environment's AI in `targets/services/` for Alloy to scrape on the app network |
| Docs | • The CI/CD guide describes the three layers, the metric schema and how to add a service; the API contract lists AI's `GET /metrics`; the VPS network diagram shows Caddy's `:9180` and Alloy's scrapes |

Check: on a local copy of the monitoring stack with a test Caddy over HTTPS and a fake `smart-ledger-staging-core-1`, every panel query of the three dashboards ran through Grafana without errors; with 1 in 10 requests failing the rules gave 9.99% 5xx; a local AI under uvicorn was scraped (`up=1`) and its rules gave the 4xx rate; the AI test suite passes; `caddy validate`, `promtool check rules` and `docker compose config` with the playbook's override pass. Not verified on the VPS: root disk, certificate days, AI and Bifrost probes, Caddy's host label for the real domains, and the AI scrape on the app network. Bifrost request metrics are not added. Commit: the one that adds this entry.

### 2026-10-29 — Daily Core user activity (CORE-018)

| Area | Change |
|---|---|
| Core | • Owner-approved V19 adds a private user/day table with PK, FK and date index; successful authenticated API reads and writes count once per Vietnam date for ACTIVE OWNER/ADMIN<br>• Default-off recorder has a bounded cache, independent committed writes, retry after telemetry errors and hourly 90-day retention; no client API or shared-environment activation |
| Docs | • BR-023 → FR-036 → AC-101–103, ERD and rollout/rollback guide define the scope; read-only Grafana SQL separates roles and excludes loadtest accounts |

Check: 27 CORE-018 tests passed on disposable PostgreSQL 16.15; full Maven verify passed 1449 tests with zero failures/errors/skips; PostgreSQL gate unit tests passed 13 cases. Shared-DB migration, Grafana provisioning and staging/production acceptance are not verified. Commit: the one that adds this entry.
