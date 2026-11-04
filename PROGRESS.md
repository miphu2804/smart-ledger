### 2026-11-04 — One class-based evaluation pipeline for agent_chat and memory

| Area | Change |
|---|---|
| AI | • `evaluation/run.py <evaluation>` picks `AgentChatEval` or `MemoryEval` from the `EVALS` dispatch table; `EvaluationPipeline` runs each case through the evaluation's target, then through its evaluators<br>• `metrics/` holds one evaluator class per layer (`TaskEvaluator`, `ToolUseEvaluator`, `MemoryEvaluator`, `RecallEvaluator`, `ResponseQualityEvaluator`, `SafetyEvaluator`, `PerformanceEvaluator`) and a `Judge`, as in the NexiraCopilot evaluation platform<br>• `targets/` wraps the real services, one class per file: `AgentTarget` runs the app's agent with a `WithoutMemoryWrites` proxy instead of patching `remember`; `MemoryTarget` calls `AgentMemoryService.with_memories` on the local database with a `CachingEmbedder`<br>• `agent_chat/cases.yaml` holds each case's full SQL with no templates; `memory/cases.jsonl` freezes the 2374 queries from `generate.py`<br>• The memory_recall grid-search harness is removed; the `memory` evaluation scores the shipped ranking instead of a copy of it |
| CI | • `run-eval.sh` and `start-eval-database.sh` use the new paths |
| Docs | • `evaluation/README.md` explains the layout and how to add an evaluation; ADR-0002, ADR-0008, ADR-0009, `ci-cd.md`, `.honeyhive/README.md` and the AI README point at the new paths |

Check: `agent_chat --dry-run` prints the same plan as before except `suite_version`, which moves from `7a34fe0c0744` to `f459b4c569b6` because the SQL in `cases.yaml` lost its stray indentation and trailing spaces (the expected values are unchanged); `memory --gate` gives recall 0.860, by form 0.951 / 0.899 / 0.627, stale-only 0.039, equal to the numbers ADR-0002 recorded, and leaves no row in the local database; unit tests 452 passed; ruff check and format pass. Not verified: a full paid `agent_chat` run, `--sync`, and the CI workflow. Commit: the one that adds this entry.

### 2026-11-04 — Assistant chats wait with dots and share one composer

| Area | Change |
|---|---|
| Mobile | • While the first words of an answer are on their way, the Trợ lý screen and the quick-ask sheet on Đơn hàng show only three pulsing dots (`TypingDots`); the waiting phrases, timer and tool step names are gone<br>• Answers no longer start with the Bobi icon and the "Trợ lý Bobi" label<br>• The quick-ask sheet uses the Trợ lý screen's input (`ChatComposer`: type, record, send) and drops its button to the Trợ lý screen, which left no way back<br>• Unused code removed: `ThoughtLine`, the waiting phrases and tool step labels with their tests |
| Docs | • `api-contracts.md` describes the new waiting state; PRD `AC-118` |

Check: `npx tsc --noEmit` passes; unit tests 178/180, with `parseOrder` and `quickNav` failing on `staging` too; `npx playwright test` on this branch; both screens checked on the mock web build at 375×812 in the session that wrote the change. Not verified: answers from real AI and Core, and a real phone. Commit: the one that adds this entry.
### 2026-11-04 — agent_chat eval split into a package

| Area | Change |
|---|---|
| AI | • `evaluation/agent_chat/run.py` (1167 lines) is now a thin command line over `cases.py`, `scoring.py`, `judge.py`, `pipeline.py`, `reporting.py` and `honeyhive_sync.py`, laid out by role like the NexiraCopilot evaluation platform, with no behavior change<br>• `honeyhive_sync.py` and the command line are the only modules that import `honeyhive`; scoring, judging and reporting run without it<br>• The unit tests import the modules instead of loading the script from its path |
| Docs | • The agent_chat README lists the new modules and names the module that does each step |

Check: an AST comparison finds 71 of the 72 old top-level symbols unchanged, and `RESULTS` still points at `agent_chat/results`; the 69 datapoints built after the split match the ones built before byte for byte, with `suite_version` `7a34fe0c0744`; `--dry-run` prints the same plan apart from the random `session_id`; unit tests 441 passed; ruff check and format pass. Not verified: a full run with the model and `--sync`. Commit: the one that adds this entry.

### 2026-11-03 — Revenue questions on Orders open the assistant in a sheet

| Area | Change |
|---|---|
| Mobile | • Under the totals card on Orders, three chips ask Bobi about revenue (last month, this month against last month, best sellers over 7 days), like the revenue page of MoMo<br>• A chip opens a bottom sheet that sends the question through the same agent stream as the Assistant screen, shows the answer as it arrives, follow-up chips and a box to ask more; an AI error puts the question back in the box, and leaving the screen closes the sheet |
| Docs | • `AC-116` for the chips and the sheet |

Check: `tsc` passes; `node --test` 185/187 (the new `aiSuggestions` tests pass; `parseOrder` and `quickNav` fail on `staging` too); on the mock web build at 375×812 a chip opens the sheet and sends the question, follow-ups and the AI-failure path work, and opening the Assistant closes the sheet. Not checked against real Core and AI, or on a phone.

### 2026-11-03 — Sign-in screen as one card, without Facebook

| Area | Change |
|---|---|
| Mobile | • `welcome.tsx` becomes one centred card: logo, "Đăng nhập Sổ Nghe Lời", full-width "Tiếp tục với Google" and "Tiếp tục với Zalo", a "hoặc" divider, an email field with "Tiếp tục", "Quên mật khẩu?" and the footer "Chưa có tài khoản? Tạo tài khoản"; the policy link stays below the card for `AC-110`<br>• The Facebook button is gone; the Facebook sign-in code and SDK stay<br>• The method of the last successful sign-in on the device (`lastSignInStorage`: a file on the phone, `localStorage` on web) gets a "Lần trước dùng" badge<br>• The typed email reaches the password screen through `emailDraft` in memory, not a route param, so on web it never lands in the URL; `email.tsx` opens in login or reset mode from the `mode` param |
| Tests | • `tests/lastSignIn.test.ts` covers reading the stored method; `e2e/smoke.spec.ts` expects the new title and no "Facebook" text |
| Docs | • `FR-010` and the login description drop Facebook and `AC-117` covers the new screen; the mobile README follows the new labels |

Check: `tsc --noEmit` passes; `node --test tests/*.test.ts` passes 184 of 186, and the two failures (`parseOrder`, quick nav) also fail on `staging`; Playwright 4 of 4; on the mock web build at 375×812 an invalid email shows the error, a valid one opens the password screen prefilled with no email in the URL, "Quên mật khẩu?" opens the reset form prefilled, and the badge appears after a sign-in. Not verified: real Google and Zalo sign-in, and a phone. Commit: the one that adds this entry.

### 2026-11-03 — Pinned actions, Dependabot, code owners and a security policy

| Area | Change |
|---|---|
| CI | • Every third-party action is pinned to a full commit SHA with its release as a comment, because the repository is public and jobs run on the owner's self-hosted machines<br>• `.github/dependabot.yml` opens one grouped pull request a week against `staging` for GitHub Actions, the AI and deploy Dockerfiles and the Compose stacks; app packages and `backend/core` stay out<br>• `.github/CODEOWNERS` requests the owner's review on CI, deploy, scripts, secrets, HoneyHive config, `docs/development/` and Core |
| Docs | • `SECURITY.md` asks for private vulnerability reports; `ci-cd.md` gains "Ownership and dependency updates" |

Check: `actionlint` passes; `check-jsonschema` validates `dependabot.yml` and every workflow; each pinned SHA was resolved from its tag through the GitHub API. Not verified: Dependabot's first run, and private vulnerability reporting, which is still off in the repository settings. Commit: the one that adds this entry.

### 2026-11-03 — Infra plans only merged code and shares the VPS lock with the backend deploy

| Area | Change |
|---|---|
| CI | • A pull request into `infra.yml` gets only the lint, so code that is not merged never reads the root SSH key; a push to `staging` now plans then applies, and the `infra-plan` environment is gone<br>• `scripts/ci/plan-infra-runs.sh` lists the runs instead of a 20-line inline step<br>• The infra run and `deploy-backend.yml` share the concurrency group `vps-<environment>` with `queue: max`, because both write the app directory and the default queue cancels all waiting jobs but the newest; `.github/actionlint.yaml` ignores the `queue` key, which actionlint 1.7.12 does not know yet |
| Docs | • `ci-cd.md` lists every workflow and the three infra environments with their branch rules; `ci-cd.drawio` draws `infra.yml` to Ansible and the SVG is re-exported |

Check: `actionlint`, `shellcheck` and `check-provider-coupling.sh` pass; `plan-infra-runs.sh` printed the expected runs for a review, a push to `staging` and `main`, two manual runs and an unknown trigger. Not verified: the workflow on a runner, because the infra environments do not exist yet. Commit: the one that adds this entry.

### 2026-11-03 — Ansible flow in roles, a provider-neutral entrypoint and an infra workflow

| Area | Change |
|---|---|
| Deploy | • `deploy/ansible/playbook.yml` becomes `site.yml` with five roles (`base`, `edge`, `dopbase`, `monitoring`, `app`) and a committed one-host inventory `smart-ledger-vps`, so host-wide tasks run once instead of once per pseudo-host<br>• Scope `app` (staging or production) writes only that environment's files; scope `all` (production only) also configures the host, Dopbase with its backup cron and the shared monitoring, so a staging run no longer rewrites them or deletes the backup cron<br>• All asserts run before the host changes, the stack handler no longer ends in `|| true`, apt uses `cache_valid_time`, the Alloy override is a template, and values read from the environment have no fallbacks |
| CI | • `scripts/infra/run.sh <plan\|apply> <environment> [--scope app\|all]` replaces `scripts/secrets/vps-playbook.sh` and takes only neutral variables; `deploy/ansible/Dockerfile` is its runtime<br>• `infra.yml` lints, plans staging on pull requests, applies staging on a push to `staging` and plans then applies production on a push to `main` |
| Docs | • `ci-cd.md` describes the roles, scopes, the entrypoint and the four GitHub environments |

Check: `ansible-playbook --syntax-check`, `ansible-lint` (production profile), `shellcheck`, `actionlint` pass; `--list-tasks` for scope `app` lists no `base`, `edge`, `dopbase` or `monitoring` task; the new templates render byte-identical to the old inline content; a check-mode run of the `app` role against localhost passes; the image builds with Dopbase 0.1.10 verified by sha256. Not verified: any run against the VPS, the workflow on a runner, and the credential map pages (no logged-in Dopbase). Commit: the one that adds this entry.

### 2026-11-03 — GitHub Actions as a thin adapter over scripts/ci

| Area | Change |
|---|---|
| CI | • Every workflow step of more than five lines moved to `scripts/ci/<verb-noun>.sh` and reads its inputs from `env:`, so no `${{ }}` reaches a script and the same script runs on a laptop; inline `run:` lines fell from 563 to 96, 9 of them in `release-policy.yml`, which another branch owns<br>• `scripts/ci/lib.sh` is the one file that reads `GITHUB_*`; it fills `SMARTLEDGER_ENVIRONMENT`, `_COMMIT`, `_REF`, `_RUN_ID` and four more, and wraps annotations, outputs, env, PATH, summary and temp directory; `check-provider-coupling.sh` runs in the shellcheck job and fails on `GITHUB_` or `${{` elsewhere in `scripts/` and `deploy/`<br>• `changes.sh` replaces `dorny/paths-filter` with a `git diff` over a full checkout, with the same areas and output names; `select-runner.yml`, the CI summary job, the CD hand-off and the mobile gate now check out `scripts/ci` to reach their script<br>• `android-release.sh` and `preflight.sh` use `ci_running` and `ci_summary` |
| Docs | • `ci-cd.md#scripts` describes the adapter split, the variables and a runbook for deploying `ai` from a laptop |

Check: shellcheck and actionlint pass; `changes.sh` matched the old dorny rules on 80 single-commit ranges of `staging`, a fake pull request merge commit and a push; 17 scripts ran locally with sample input, including `start-ssh-agent.sh` with a throwaway key. Not verified: any workflow on a runner (GitHub-hosted runners are billing-locked), the image push, the VPS deploy, the Vercel steps and the R2 publish. Commit: the one that adds this entry.
### 2026-11-02 — Agent chat eval offline with a manual CI gate, memory recall on the trace

| Area | Change |
|---|---|
| AI | • A `memory recall` span in each chat session carries the question, the recalled memories with their scores and `recalled_count`<br>• `evaluation/agent_chat/run.py` scores locally with five HoneyHive evaluator templates judged through Bifrost, two seeded memory cases (recall only in those cases, writes off), and two safety metrics copied from the production evaluators; `--gate thresholds.toml` exits 1 below a minimum, `--report` writes markdown by layer, and only `--sync` sends scores to HoneyHive<br>• `.honeyhive/evaluators/sql-parse-check.yaml` parses each `query_shop_data` SQL in production |
| CI | • `eval-regression.yml`, dispatched by hand from `staging`, runs the eval of input `ref` on a throwaway database with `ai/staging` settings and posts the report to the job summary and the pull request<br>• `scripts/local-db.sh` takes a container name and port, and pushes the AI migrations with `sslmode=disable`, without which `supabase db push` failed on a fresh database |
| Docs | • The eval README, ADR-0009, `.honeyhive/README.md` and `ci-cd.md#eval-regression` |

Check: 484 unit tests and ruff pass; actionlint passes; an Opus review found the report rows replacing the `tool_calls` metric with the list of calls (fixed, with a test on a row built by `report()`), one failed judge call dropping a whole case (now only that metric), and workflow hardening (fixed); the workflow's database step (throwaway container on a free port, owner insert, seed) ran locally and `run.py --dry-run --repeats 3` built 69 datapoints on it; `sql-parse-check` scored 691 real events without an exception and now also reads arguments sent as a JSON string. Not verified: a full run with models, the workflow on a runner, and the pull request comment. Commit: the one that adds this entry.

### 2026-11-02 — HoneyHive config as code and four new answer evaluators

| Area | Change |
|---|---|
| AI | • Evaluators and alerts move from `backend/ai/evaluation/honeyhive` to `.honeyhive/` at the repository root in the layout of HoneyHive's Config as Code guide; `apply.py` gives way to the guide's `sync-evaluators.sh` (IDs kept in `.honeyhive/state.json`, seeded with the two existing evaluators) and `sync-dashboards.sh` (charts upserted and alerts created by name for the projects in `projects.yaml`)<br>• Four Python evaluators score each `agent-chat` session against Bobi's prompt: `unsupported-figure` (a figure with no tool call and not in the question), `format-violation` (forbidden Markdown), `invalid-chart` (a chart block `readChart` in the app cannot draw) and `non-vietnamese-answer`; no LLM judge, because of `NFR-008`<br>• Four charts split by `source`: first-words wait p50, tool calls per turn, query error rate and unsupported figure rate |
| CI | • `honeyhive-sync.yml` and `honeyhive-dashboards.yml` run the scripts on a merge into `main` with the CLI pinned to v1.9.0; the evaluator workflow fails when a run changes `state.json`, so an evaluator created in CI is not duplicated on the next run |
| Docs | • `.honeyhive/README.md`, the AI README and ADR-0009 point at the new layout; the credential map was regenerated with the three GitHub secrets |

Check: the CLI schemas validate every evaluator, chart and alert file, including as the scripts render them with `metric_id` or `project_id`; shellcheck and actionlint pass; the new evaluators pass 24 hand-written cases and, run locally on the last 99 `agent-chat` sessions, flag only test probes. Not verified: the scripts against HoneyHive, the chart metric names (a chart query needs a workspace data plane key), and that the evaluator sandbox exposes the session's `tool_calls` in `metrics`. Commit: the one that adds this entry.
### 2026-11-02 — Dev machines pull the dev environment from Dopbase

| Area | Change |
|---|---|
| Secrets | • `apply.sh` takes `dev` as the source and skips the loadtest and monitor targets, which only staging holds; `dopbase-sync.sh pull dev` writes `core/dev`, `ai/dev` and `mobile/dev` into `secrets/dev/env/`, so a dev machine no longer reads staging<br>• The templates list the dev-only Core keys and drop `HH_SAMPLE_RATE`; Dopbase lost the stale AI keys, `GOOGLE_APPLICATION_CREDENTIALS`, both `OPENCODE_GO_API_KEY` entries and the stray `USER_RATE_LIMIT_ENABLED` in vps, and gained `MODEL_ALIASES` in `ai/staging`, `USER_RATE_LIMIT_ENABLED=false` in core, the three tuned AI timeout and sandbox values in `ai/production` and `GATEWAY_DOMAIN` in `vps/production`; `LITELLM_URL` is gone from Dopbase, the template and `.env.example`, and `TYPESAFE_API_KEY` stays for future work, and `release/production` now holds `RELEASE_KEYSTORE`, `KEYSTORE_PASSWORD` and `RELEASE_KEY_ALIAS` so `android-release.sh` reads them; `monitor/staging` lost the five uptime URL keys, so `.env.monitor` keeps only the read-only Grafana login |
| Docs | • Local setup, secrets docs and the AI README pull and apply `dev`; `apply.sh staging dev` stays as the deliberate staging test; the credential map is regenerated and `secrets-and-env.md` describes `.env.monitor` as the Grafana login only |

Check: `scripts/secrets/check-templates.sh` passes; `scripts/secrets/apply.sh dev dev` listed only `+ USER_RATE_LIMIT_ENABLED` in Core, the six removed AI keys and no change for mobile, then wrote the three files with `.bak` backups; `secrets/dev/env/.env.ai` no longer holds the removed keys. Commit: the one that adds this entry.

### 2026-11-02 — User flow map of the mobile app in docs

| Area | Change |
|---|---|
| Docs | • `docs/product/userflow/index.html` is a dark pannable map of the mobile app's user flows with screenshots, decisions, system steps and red failure edges; clicking a node opens its source file, FR codes and next hops; it opens straight from disk like the credential map and targets desktop screens only<br>• Six flows follow the current navigation on `staging`: sign-in and shop setup, selling and checkout, orders with reports and notifications, the Bobi tab, the Quản lý tab, and the quick menu with shop switching; the removed mascot "Gợi ý" path is gone<br>• All 40 screenshots are taken on `staging` with the test account on "Tiệm Test Team", using real orders #27282 (debt), #27283 and #27284 (voice order typed through "Nhập tay") and one real Bobi answer; barcode scanning, email verification, shop setup and stock-in stay as step nodes without a picture, with a note saying why<br>• The folder README says how to open, rebuild and retake screenshots; the docs map links it |
| Web | • The page source lives in `src/userflow`; `npm run userflow` builds it into the docs folder as one file with script, styles and font inlined, because browsers refuse module scripts and fonts from `file://`; the web app's own build does not include it |

Check: `npm run typecheck`, `npm run lint` and `npm run build` pass in `frontend/web`, and `dist` holds no userflow file; headless Chrome opened `index.html` over `file://` for all six flows with every screenshot loaded (52 of 52) and the Geist font active; the design skill's inspector rendered all six flows at 1440 and 768 px with no layout failure. The three test orders and the Bobi conversation stay on the staging test shop. `staff` and `printer` are left out because the app has no way to reach them. Commit: the one that adds this entry.

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
