### 2026-11-04 — Admin account menu moves to the sidebar

| Area | Change |
|---|---|
| Web | • Admin header: no subtitle under the page title and no line under the header<br>• Khách hàng and Nhật ký truy cập: the faded "dữ liệu hỗ trợ tối thiểu" and log notices are gone<br>• The avatar moves from the header to the bottom of the sidebar, under Hệ thống, as a row with name and role; clicking it opens the menu above it (email, Hồ sơ, Phiên & quyền truy cập, Đăng xuất); when the sidebar is collapsed only the avatar shows and the menu opens 240 px wide<br>• Admin labels say "chủ tiệm" instead of OWNER or "chủ cơ sở" (the role value stays `OWNER`)<br>• On desktop (1280 px and up) the sidebar column stays 72 px and the open sidebar slides over the content, which is centered up to 1200 px wide, so opening or closing it never moves the content; it starts collapsed |

Check: `npm run typecheck`, `oxlint` and `npm run build` pass; on the mock admin at 1440 × 900, 1024 × 768 and 375 × 812 the menu opens above the avatar and is not cut off. Not verified: real Core mode in a browser. Commit: the one that adds this entry.

### 2026-11-04 — LLM router call shows up in HoneyHive

| Area | Change |
|---|---|
| AI | • The tier classification call to Bifrost runs inside an `llm router` span of the turn's HoneyHive session, with the user messages as input, the tier and alias as output and the mechanism as metadata; the classifier calls Bifrost over plain HTTP, which the agent instrumentation never saw |

Check: `uv run ruff check` and `uv run pytest tests/unit_tests` (472 passed). Not verified: the span on a real HoneyHive session, since traces run only in production. Commit: the one that adds this entry.

### 2026-11-04 — User flow map follows the new sign-in and the Bobi sheet

| Area | Change |
|---|---|
| Docs | • Sign-in flow: the card from #499 (Google, Zalo, email with Tiếp tục, no Facebook), a "Quên mật khẩu?" edge straight from the sign-in screen, and the password screen with the email filled in<br>• Orders flow: the Bobi suggestion strip on Đơn hàng and a new "Hỏi Trợ lý Bobi" node for the sheet from #491, with a step that links to Trợ lý history<br>• Bobi flow: notes for the composer shared with the sheet (#505), the thought line while waiting (#513) and the five quick chips<br>• Seven screenshots retaken or added on staging: `welcome`, `email-login`, `invoices`, `ai-ask-sheet`, `chat-tro-ly-ai`, `chat-dat-cau-hoi`, `chat-tra-loi`; the README says how and which test data they show |

Check: `npm run userflow` builds the page; the onboarding and orders flows render with the new edges and node on a local server. Not verified: other browsers. Commit: the one that adds this entry.

### 2026-11-04 — Cleaner routes in the CI/CD and runtime diagram

| Area | Change |
|---|---|
| Docs | • `ci-cd.drawio` and `ci-cd.svg`: Staging and Production use the same data lanes (SQL above traces), Core and AI share one SQL lane, and HoneyHive sits under Production DB<br>• Fixed the Loki icon offset, the `7. chat` arrows into LLM providers and the DB names in the diagram guide |

Check: `validate.py` 0 errors; SVG exported with `drawio` and checked on rendered PNGs. Not verified: a dark viewer. Commit: the one that adds this entry.

### 2026-11-04 — More room between messages in the Bobi sheet

| Area | Change |
|---|---|
| Mobile | • In the "Hỏi Trợ lý Bobi" sheet on Orders, the answer has no bubble, so the open-screen button (`ScreenActions`, pulled up by `marginTop: -4` for the bubbles in `/ai`) covered the last line of the answer; it now sits 14 below the text<br>• Questions, answers and follow-up chips are 20 apart instead of 12, and the chips 10 instead of 8<br>• The scroll area reaches the sheet edges and pads inside, so the button's purple shadow is no longer cut straight at the left edge |

Check: `npx tsc --noEmit` passes; on the mock web build at 390 × 844, a low-stock question in the sheet shows "Mở Hàng hoá" below the text with an uncut shadow. Not verified: a real phone. Commit: the one that adds this entry.

### 2026-11-04 — Android builds go to R2 instead of GitHub artifacts

| Area | Change |
|---|---|
| CI | • `mobile-release.yml` no longer uploads artifacts: from 2026-11-03 the account's 500 MB artifact quota failed every Android build after Gradle had finished<br>• A build that does not publish uploads its APK or AAB to R2 as `android/<environment>/ci/<run>/<file>` (`scripts/ci/upload-build.sh`) and puts the download link on the run page<br>• `check-upload-prerequisites.sh` (was `check-publish-prerequisites.sh`) checks the R2 settings on every build and the keystore only on a publish |
| Docs | • `ci-cd.md` Android build: R2 settings for each `android-*` environment, a separate bucket for dev and staging, the lifecycle rule, and how to take the AAB to Google Play |

Check: both scripts run with a fake `aws` CLI (missing settings, publish without keystore, no CLI, AAB and APK keys, failed upload); `bash -n`; `scripts/ci/check-provider-coupling.sh`; the workflow parses as YAML. Not verified: a real run, shellcheck and actionlint (CI runs them). `android-dev` and `android-staging` have no R2 settings yet, so their builds stop at the check until a bucket and token are added. Commit: the one that adds this entry.

### 2026-11-04 — Readable eval output and a simpler eval README

| Area | Change |
|---|---|
| AI | • `evaluation/core/render.py` renders a `Table` to the terminal with rich and to markdown; the eval report prints a progress bar, a per-case table and a metrics table with bounds and PASS or FAIL<br>• A run logs `WARNING` and above unless `--verbose` or `LOG_LEVEL` is set; `--model ALIAS` runs the agent on another alias while the judge keeps `chat`<br>• A run gates on the evaluation's own `thresholds.toml` by default; `--gate` picks another file |
| Docs | • The three evaluation READMEs are rewritten short: the plain command first, options after, then the files to touch for common changes |

Check: unit tests 456 passed, ruff check and format pass; `uv run evaluation/run.py memory` with no flags shows 5 PASS rows and exits 0, recall 0.8601516427969671, local database rows equal before and after; a stricter `--gate` file exits with `gate failed: recall: 0.86 < 0.99`; `agent_chat --dry-run` prints no INFO line and the same plan as before. Not verified: a paid `agent_chat` run with `--model`. Commit: the one that adds this entry.

### 2026-11-04 — Chat turns pick their model by complexity

| Area | Change |
|---|---|
| AI | • With `MODEL_TIERING_ENABLED=true`, TypeSafe Jev rates each turn through Bifrost's `/v1/decisions` and the turn runs on `chat-simple`, `chat-medium` or `chat-complex` (planned as `mercury-3` low, `mercury-3` high, `gpt-6-luna` xhigh), so easy questions answer fast; off by default, every turn stays on `chat`<br>• The rating runs beside memory recall; an error, a timeout past 1.5 s or a refusal runs `chat-complex`, a conversation keeps the highest tier it reached and stops asking Jev once complex, and all steps of a turn use one model<br>• HoneyHive sessions carry `tier`, `tier_alias` and `tier_mechanism` next to the turn's real `model` |
| Deploy | • `bifrost.json` adds the `typesafe` provider (`TYPESAFE_API_KEY`, no retries), lets `vk-ai` use `jev-latest`, and limits `inception` to chat completions, which is all Mercury serves |
| Docs | • ADR-0008 update on why tiers are picked in AI and not by Bifrost routing rules, AI README section on model tiers, the Bifrost key in `ci-cd.md`, regenerated credential map |

Check: unit tests 457 passed, ruff check and format pass; startup wiring checked with the four aliases set and with them missing (`tiering off`). Not verified: a real `/v1/decisions` call, `gpt-6-luna` with effort `xhigh`, Mercury in real chat, and the chat eval with tiers on. Commit: the one that adds this entry.

### 2026-11-04 — One class-based evaluation pipeline for agent_chat and memory

| Area | Change |
|---|---|
| AI | • `evaluation/run.py <evaluation>` picks `AgentChatEval` or `MemoryEval` from the `EVALS` dispatch table; `EvaluationPipeline` runs each case through the evaluation's target, then through its evaluators<br>• `metrics/` holds one evaluator class per layer (`TaskEvaluator`, `ToolUseEvaluator`, `MemoryEvaluator`, `RecallEvaluator`, `ResponseQualityEvaluator`, `SafetyEvaluator`, `PerformanceEvaluator`) and a `Judge`, as in the NexiraCopilot evaluation platform<br>• `targets/` wraps the real services, one class per file: `AgentTarget` runs the app's agent with a `WithoutMemoryWrites` proxy instead of patching `remember`; `MemoryTarget` calls `AgentMemoryService.with_memories` on the local database with a `CachingEmbedder`<br>• `agent_chat/cases.yaml` holds each case's full SQL with no templates; `memory/cases.jsonl` freezes the 2374 queries from `generate.py`<br>• The memory_recall grid-search harness is removed; the `memory` evaluation scores the shipped ranking instead of a copy of it |
| CI | • `run-eval.sh` and `start-eval-database.sh` use the new paths |
| Docs | • `evaluation/README.md` explains the layout and how to add an evaluation; ADR-0002, ADR-0008, ADR-0009, `ci-cd.md`, `.honeyhive/README.md` and the AI README point at the new paths |

Check: `agent_chat --dry-run` prints the same plan as before except `suite_version`, which moves from `7a34fe0c0744` to `f459b4c569b6` because the SQL in `cases.yaml` lost its stray indentation and trailing spaces (the expected values are unchanged); `memory --gate` gives recall 0.860, by form 0.951 / 0.899 / 0.627, stale-only 0.039, equal to the numbers ADR-0002 recorded, and leaves no row in the local database; unit tests 452 passed; ruff check and format pass. Not verified: a full paid `agent_chat` run, `--sync`, and the CI workflow. Commit: the one that adds this entry.

### 2026-11-04 — Assistant chats wait with the thought line again

| Area | Change |
|---|---|
| Mobile | • The Trợ lý screen and the quick-ask sheet show the thought line (`ThoughtLine`: rotating waiting phrases and tool step labels) again instead of the three typing dots<br>• Restored `ThoughtLine`, the waiting phrases and tool step labels with their tests; removed `TypingDots`<br>• Kept the shared `ChatComposer` and answers without the Bobi icon and label |
| Docs | • `api-contracts.md` and `AC-118` describe the thought line again |

Check: `tsc` reports no error in `src` (only the missing `@playwright/test` module in `e2e/`); `node --test tests/thinkingPhrases.test.ts tests/toolSteps.test.ts` passes 9/9. Not verified on a device.

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

### 2026-11-03 — Follow the email sign-in flow in account tests

| Area | Change |
|---|---|
| Mobile | • Account tests enter an email before continuing to the password screen.<br>• The password-change test checks that the email carries over. |

Check: the old email-button step times out after staging synchronization. `npm run typecheck` and five focused unit tests pass. All 23 Playwright tests pass. Commit: the one that adds this entry.

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

### 2026-11-03 — Reuse E2E helpers and select the active quick menu

| Area | Change |
|---|---|
| Mobile | • Smoke and shop-switching checks reuse error and navigation helpers.<br>• Quick navigation uses role locators to skip background tabs and preserve Playwright's actionability checks. |

Check: delayed and background-menu browser checks pass after failing on the earlier selectors. `npm run typecheck` and all 23 Playwright tests pass. Commit: the one that adds this entry.

### 2026-11-02 — Independent stock decreases for CORE-021

| Area | Change |
|---|---|
| Core | • Add an OWNER stock-adjustment API with a positive decrement and mandatory reason; reuse Product locks, V7 idempotency and STOCK_ADJUSTED audit with the new allowed source<br>• Stock, notification reconciliation and original response commit together; reject overdraw/untracked products and preserve prices and money records<br>• PostgreSQL tests cover normalized replay, concurrent writers, overdraw, managed stale stock and failure rollback; require these cases in the CI execution gate |
| Docs | • Add BR-025, FR-038 and AC-111–115, the API contract and Core handoff; no migration, environment variable or FE/AI change |

Check: `mvn verify` passed 1514 tests with PostgreSQL enabled, zero failures/errors/skips; 13 gate self-tests passed. Reverified after merging staging bec1a37 on 2026-11-04: all 1514 tests and the 13 gate self-tests passed; the Python report gate confirmed all 17 required PostgreSQL suites and methods without skips. The disposable PostgreSQL 17.11 container was removed after verification. No shared database or deployment was changed. Commit: the one that adds this entry.

### 2026-11-02 — Agent chat eval offline with a manual CI gate, memory recall on the trace

| Area | Change |
|---|---|
| AI | • A `memory recall` span in each chat session carries the question, the recalled memories with their scores and `recalled_count`<br>• `evaluation/agent_chat/run.py` scores locally with five HoneyHive evaluator templates judged through Bifrost, two seeded memory cases (recall only in those cases, writes off), and two safety metrics copied from the production evaluators; `--gate thresholds.toml` exits 1 below a minimum, `--report` writes markdown by layer, and only `--sync` sends scores to HoneyHive<br>• `.honeyhive/evaluators/sql-parse-check.yaml` parses each `query_shop_data` SQL in production |
| CI | • `eval-regression.yml`, dispatched by hand from `staging`, runs the eval of input `ref` on a throwaway database with `ai/staging` settings and posts the report to the job summary and the pull request<br>• `scripts/local-db.sh` takes a container name and port, and pushes the AI migrations with `sslmode=disable`, without which `supabase db push` failed on a fresh database |
| Docs | • The eval README, ADR-0009, `.honeyhive/README.md` and `ci-cd.md#eval-regression` |

Check: 484 unit tests and ruff pass; actionlint passes; an Opus review found the report rows replacing the `tool_calls` metric with the list of calls (fixed, with a test on a row built by `report()`), one failed judge call dropping a whole case (now only that metric), and workflow hardening (fixed); the workflow's database step (throwaway container on a free port, owner insert, seed) ran locally and `run.py --dry-run --repeats 3` built 69 datapoints on it; `sql-parse-check` scored 691 real events without an exception and now also reads arguments sent as a JSON string. Not verified: a full run with models, the workflow on a runner, and the pull request comment. Commit: the one that adds this entry.
