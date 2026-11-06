---
okf_version: "0.2"
---

<!-- Kept by hand under the docs rules in AGENTS.md: each entry repeats its document's frontmatter title and description. -->

# SmartLedger documentation

* [SmartLedger documentation](README.md) - Reading paths by task, source-of-truth rules and which document to update for each kind of change.
* [Architecture](architecture/index.md) - Technical design, data model, decisions, diagrams and service walkthroughs.
* [API Contract — SmartLedger](contracts/api-contracts.md) - FE ↔ Core and Core ↔ AI contracts, with the implemented or target status of each endpoint.
* [Design](design/index.md) - Mobile UI style and wording decisions.
* [Development and operations](development/index.md) - Local setup, CI/CD, secrets and release guides.
* [Product screenshots for marketing](marketing/README.md) - Phone-ratio screenshots for each product flow, for marketing use; demo data, not a source of behavior.
* [Product scope and requirements](product/index.md) - Business and product requirements, the product overview and user flows (Vietnamese).

# Repository docs outside docs/

* [SmartLedger](../README.md) - Repository entry point: what the product is, how the services fit together and where to start.
* [Contributing](../CONTRIBUTING.md) - Commit, branch, pull request and merge rules, plus the PROGRESS.md format.
* [Security policy](../SECURITY.md) - How to report a vulnerability and what happens next.
* [HoneyHive config as code](../.honeyhive/README.md) - Evaluators, charts and alerts that watch the shop agent, kept as files and how to apply them.
* [SmartLedger AI](../backend/ai/README.md) - Internal FastAPI service for the owner Agent chat: routes, configuration, guardrails, memory and observability.
* [Evaluation](../backend/ai/evaluation/README.md) - Scripts that run test cases against the real AI code, score the results and print a table.
* [Agent chat evaluation](../backend/ai/evaluation/agent_chat/README.md) - Asks the real chat agent fixed questions about a made-up shop and checks figures, tools, memory and leaks.
* [Memory evaluation](../backend/ai/evaluation/memory/README.md) - Checks that memory recall finds the fact a chat message needs, using the shipped ranking.
* [SmartLedger Core — setup](../backend/core/README.md) - How to run, configure and test the Java Core service, with per-feature regression guides.
* [Admin dashboard: daily creation counts](../backend/core/docs/admin-dashboard-growth.md) - Core handoff for the ADMIN daily creation API: verification steps and history.
* [Independent stock decreases — CORE-021](../backend/core/docs/stock-adjustments.md) - Core handoff for stock decrease adjustments: scope and how to test.
* [Daily user activity — CORE-018](../backend/core/docs/user-daily-activity.md) - Core guide for recording daily user activity: limits, retention, rollback and the DAU/MAU SQL.
* [CORE-019: shared success quotas](../backend/core/docs/user-rate-limits.md) - Core rollout for success quotas: V20 schema, activation and recovery.
* [CORE-016 — Android Core integration and V18 rollout](../backend/core/docs/zalo-android-preparation.md) - Core guide for Zalo Android sign-in: verification and staging activation after merge.
* [CORE-015: Zalo authentication implementation plan](../backend/core/docs/zalo-auth-implementation-plan.md) - Design and implementation plan for Zalo web sign-in in Core.
* [CORE-015 local verification evidence](../backend/core/docs/zalo-auth.tdd.md) - Test-driven records and local verification evidence for Zalo web sign-in.
* [Manual Zalo login against local Core](../backend/core/docs/zalo-manual-login.md) - Opt-in local test kit for trying Zalo login against a local Core.
* [Sổ Nghe Lời — Frontend](../frontend/README.md) - Overview of the two frontend projects, web and mobile, and how to run each.
* [Sổ Nghe Lời — Mobile (Expo)](../frontend/mobile/README.md) - How to run, configure and test the OWNER mobile app, including Firebase, speech and Core setup.
* [Speech recognition model (sherpa-onnx)](../frontend/mobile/assets/models/README.md) - Which on-device speech model files the app needs, how to fetch them and how releases serve them.
* [Sổ Nghe Lời — Web (landing + admin)](../frontend/web/README.md) - How to run and deploy the landing page and the admin pages, in mock and real mode.
* [Bruno API collection](../scripts/bruno/README.md) - Bruno requests for the Core API and how to run them against an environment.
* [secrets](../secrets/README.md) - Local copies of the team env files pulled from Dopbase, and what is tracked in git.
