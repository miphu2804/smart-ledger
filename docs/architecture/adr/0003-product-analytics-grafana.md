---
type: Architecture Decision
title: "ADR-0003: Product analytics in Grafana, read from Core and AI data"
description: "Proposed: product usage metrics in Grafana, read from Core and AI data through a read-only role."
owner: not assigned
status: draft
author: miphu2804
---
# ADR-0003: Product analytics in Grafana, read from Core and AI data

- **Status:** Proposed. The P1 datasource, dashboard and playbook are already in the repo (`deploy/monitoring/`), but are not enabled in any environment: they are still waiting for the database owner to create the `grafana_reader` role and load `GRAFANA_PG_*` into Dopbase. There is no migration or Core/AI code; it is not product behavior until the product owner and the operations owner approve.
- **Date:** 2026-10-29
- **Owner:** not assigned; needs a product owner for the metric definitions and a database owner for the read role.
- Related: [OPS-004 #269](https://github.com/miphu2804/smart-ledger/issues/269) (monitoring), [CORE-018 #409](https://github.com/miphu2804/smart-ledger/issues/409) (DAU/MAU), the three infrastructure dashboards of PR #422.

## 1. Context

- The monitoring infrastructure already has three Infra layers in Grafana 12.1.1: overview, service and resources ([CI/CD](../../development/ci-cd.md#monitoring), [`deploy/monitoring/`](../../../deploy/monitoring/)). They answer "is the system okay", not "which features does the shop owner use".
- Core only exposes `/actuator/health`; there is no `/actuator/prometheus` and no access log with paths ([`application.yml`](../../../backend/core/src/main/resources/application.yml)). So there is no per-route request metric for Core.
- Caddy only gives metrics per host, not per route ([`Caddyfile`](../../../deploy/edge/Caddyfile)); the recording rule aggregates down to `env` and `service` ([`service-red.yml`](../../../deploy/monitoring/prometheus/rules/service-red.yml)).
- AI exposes `/metrics` through prometheus-fastapi-instrumentator with the labels `handler`, `method`, `status`, with latency measured up to the last byte of the stream ([`main.py`](../../../backend/ai/src/main.py), [AI README](../../../backend/ai/README.md)).
- Core already writes an append-only event row for each successful business operation: `audit_logs` has `actor_user_id`, `actor_role`, `shop_id`, `action`, `entity_type`, `entity_id`, `request_id`, `metadata`, `created_at`, and forbids UPDATE/DELETE ([ERD](../../architecture/erd-description.md)).
- `user_daily_activity` (V19, CORE-018) provides DAU/MAU, but at runtime it is off by default and has not been migrated/rolled out on the shared database ([rollout guide](../../../backend/core/docs/user-daily-activity.md)).
- Chat history lives in `chat_conversations`/`chat_messages`, created by the AI baseline; `ai_requests` is only a target design, with no table yet.

## 2. Constraints

- Core is frozen except for the scope of PR #368 ([AGENTS.md](../../../AGENTS.md)); the P1 design must not edit Core, add migrations or add endpoints.
- The VPS has 4 GB, and monitoring is limited to about 1 GB RAM; Grafana already uses 256 MB.
- The Supabase session pooler allows only 15 clients; Core holds up to 10 (Hikari default), AI holds up to 4 ([AI README](../../../backend/ai/docs/architecture.md#database-and-migrations)).
- The Supabase direct host is IPv6-only; a VPS without IPv6 uses the session pooler ([CI/CD](../../development/ci-cd.md#monitoring)).
- Do not store or read PII through Grafana: no customer names/phone numbers, no chat content, no expense descriptions, no emails (except the columns approved for DAU/MAU).

## 3. Product questions to answer

| Question | Metric | Source |
|---|---|---|
| How many users really come back? | DAU, WAU, MAU, DAU/MAU stickiness | `user_daily_activity` |
| Do new users stay? | Retention by signup-week cohort | `users`, `user_daily_activity` |
| How many shops are active? | Shops with an OWNER event in the week | `audit_logs` |
| Does a new shop reach its first order? | Funnel: create shop → has products → sells within 7 days | `shops`, `products`, `sales` |
| Which features are used, by how many shops? | Distinct shops by action group | `audit_logs` |
| Is the AI assistant used, and is it fast? | Conversations/day, distinct shops, p95 by route | `chat_conversations`, Prometheus AI |
| Is AI order reading effective? | Share of `AI_VOICE` drafts and share of AI drafts confirmed | `sale_drafts` |
| How is sales quality? | Orders/day, revenue/day, void rate | `sales` |
| Is the analytics data still fresh? | Age of the newest record per table | all |
| How do users sign in, and do they have to sign in again often? | Sign-ins by method | No source yet; P2 (section 6.4) |

## 4. Decision

Build a **Product** layer in Grafana from existing data, without editing Core:

1. One **read-only** PostgreSQL datasource **per environment** (staging, production) pointing at Supabase through the session pooler and the `grafana_reader` role.
2. One dashboard provisioned from the repo, **SmartLedger product**, tag `smart-ledger`, folder `Product`. Event lookup lives in a collapsed `Events` row at the bottom of the dashboard instead of a second dashboard, because it uses the same time and environment filters.
3. Every metric is defined on already-recorded events: `user_daily_activity` for users and retention, `audit_logs` for shops and features, business tables for outcomes, chat tables for AI usage, Prometheus AI for latency/errors.
4. The missing parts (sign-in, app sessions, screen views, failures) are left to P2/P3 and need Core owner approval first; section 6.4 explains why logout is not measured.

## 5. Options considered

| Option | Why not chosen |
|---|---|
| Count events with a Prometheus counter in Core | Needs a Core change, has no per-shop label because of cardinality, and resets on restart; left to P2 after the owner approves |
| Tempo/OpenTelemetry for distributed traces | Needs an OTel agent in Core (frozen) and an extra 200–400 MB container on the 4 GB VPS; AI traces go to HoneyHive per [ADR-0009](0009-end-to-end-tracing.md); it cannot answer product questions the way business data can |
| PostHog/Umami/analytics SaaS | Needs an SDK in the app, a new privacy decision, cost and data leaving our infrastructure; the team has deferred auxiliary infrastructure |
| A new `product_events` table written by the client | Needs a new Core endpoint and a migration; stronger than P1 but blocked by the Core scope; left to P3 if the PO needs an intent funnel |
| Read the production database directly with the owner role | Exceeds least privilege, with the risk of accidental writes and PII exposure |

## 6. Existing event model

### 6.1 `audit_logs` is the product event log

Each row is a successful, immutable business action with a `request_id` for tracing back. Grouped by feature:

| Feature | Action |
|---|---|
| Sales | `SALE_CONFIRMED`, `SALE_VOIDED`, `SALE_REFUND_RECORDED` |
| Debts | `DEBT_REPAYMENT_RECORDED`, `DEBT_VOIDED` |
| Products and inventory | `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_ARCHIVED`, `STOCK_ADJUSTED`, `STOCK_RESTORED_ON_VOID` |
| Categories | `CATEGORY_CREATED`, `CATEGORY_UPDATED`, `CATEGORY_ARCHIVED` |
| Expenses | `EXPENSE_CREATED`, `EXPENSE_UPDATED`, `EXPENSE_ARCHIVED` |
| Shop | `SHOP_CREATED`, `SHOP_UPDATED`, `SHOP_ARCHIVED`, `SHOP_INACTIVATED`, `SHOP_REACTIVATED` |
| Profile | `USER_AVATAR_UPDATED` |
| ADMIN | `ADMIN_*`, `SHOP_INACTIVATED`, `SHOP_REACTIVATED` with `actor_role=ADMIN` |

Limits that must be stated on the dashboard: only successes are recorded, only the actions in the whitelist, no screen views, no failed attempts, no OWNER read operations. So adoption means "did it" and not "opened it".

### 6.2 Business and AI tables

| Source | Usable columns | Metric |
|---|---|---|
| `shops` | `id`, `owner_id`, `created_at` | New shops, funnel |
| `products` | `id`, `shop_id`, `status`, `barcode`, `created_at` | Has products, barcode coverage |
| `sale_drafts` | `id`, `shop_id`, `source_type`, `confirmed_sale_id`, `created_at` | Share of AI order reading and confirmation rate |
| `sales` | `id`, `shop_id`, `total_vnd`, `sale_status`, `payment_status`, `sold_at`, `voided_at` | Revenue, void rate |
| `expenses` | `id`, `shop_id`, `amount_vnd`, `category`, `expense_at`, `source_ai_request_id` | Expense usage |
| `debts`, `payments` | `id`, `sale_id`, `customer_id`, `amount_vnd`, `status`, `created_at`, `received_at` | Debt usage |
| `chat_conversations` | `id`, `user_id`, `shop_id`, `started_at`, `last_message_at` | Assistant usage |
| `chat_messages` | `conversation_id`, `role`, `created_at` | Chat turn structure, content is not read |
| `notification_recipients` | `user_id`, `read_at`, `created_at` | Notification read rate |
| Prometheus AI | `http_requests_total`, `http_request_duration_seconds_bucket` with `handler` | Calls by route, p95, errors |

### 6.3 Missing parts, left to P2/P3

- Barcode scans, screen opens, voice starts, AI attempt counts and failures: no events.
- Time to process one order in the UI: none.
- Tracing by `request_id` in Core logs: Core does not write the request id to its logs, so events cannot yet be linked to Loki.

### 6.4 Sign-in, sign-out and app sessions

- The mobile app signs in with Firebase (Google, Facebook, email, custom token for Zalo) and then calls `POST /auth/session`; when the app is reopened, `AppStore` only restores the Firebase session and calls `GET /me` ([`AppStore.tsx`](../../../frontend/mobile/src/store/AppStore.tsx)). So each call to `/auth/session` is a real sign-in: a new account, a reinstall, a new device or being signed out.
- Core does not record this call: `audit_logs` has no sign-in action, and Caddy only measures per host. Today there is no source for the number of sign-ins.
- Sign-out is only Firebase's `signOut()` on the device, and Core receives no request. Firebase renews tokens by itself, so most shop owners never press sign-out; closing or uninstalling the app creates no event. The number of logouts is therefore small and biased, and is not used as a metric.
- "Do users come back" is already answered by `user_daily_activity` and cohort retention, without needing login/logout.
- P2 proposal: Core writes an audit `USER_SIGNED_IN` in `/auth/session` with `isNewAccount` and the method taken from the `firebase.sign_in_provider` claim of the ID token (not yet checked on a real token). It gives the usage share of each sign-in method and the number of re-sign-ins per user (a high number is a sign the app loses its session), and allows splitting cohorts by method. It needs Core owner approval; if `audit_logs` has a CHECK constraint on action, it needs a migration and a separate approval.
- P3: app sessions (`app_open`, a session ends after 30 minutes in the background), failed sign-ins by method (which never reach Core), and the reason for being signed out (user pressed, 401, 403, wrong role) from `forceSignOut`; all of these are client events.

## 7. Architecture

### 7.1 Read role

One `grafana_reader` login per environment, not a superuser, no BYPASSRLS, SELECT only per column. The SQL is handed to the database owner; this ADR does not run it:

```sql
CREATE ROLE grafana_reader LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS NOINHERIT;
ALTER ROLE grafana_reader SET default_transaction_read_only = on;
ALTER ROLE grafana_reader SET statement_timeout = '10s';
ALTER ROLE grafana_reader SET idle_in_transaction_session_timeout = '30s';
GRANT USAGE ON SCHEMA public TO grafana_reader;

-- CORE-018 already specifies this column and the matching RLS policy.
GRANT SELECT (id, system_role, email, created_at) ON public.users TO grafana_reader;
GRANT SELECT (user_id, activity_date) ON public.user_daily_activity TO grafana_reader;
CREATE POLICY grafana_daily_activity_read ON public.user_daily_activity
    FOR SELECT TO grafana_reader USING (true);

GRANT SELECT (id, owner_id, created_at) ON public.shops TO grafana_reader;
GRANT SELECT (id, shop_id, status, barcode, created_at) ON public.products TO grafana_reader;
GRANT SELECT (id, shop_id, source_type, confirmed_sale_id, created_at) ON public.sale_drafts TO grafana_reader;
GRANT SELECT (id, shop_id, total_vnd, sale_status, payment_status, sold_at, voided_at) ON public.sales TO grafana_reader;
GRANT SELECT (id, shop_id, amount_vnd, category, expense_at, source_ai_request_id) ON public.expenses TO grafana_reader;
GRANT SELECT (id, sale_id, customer_id, status, original_vnd, created_at) ON public.debts TO grafana_reader;
GRANT SELECT (id, sale_id, amount_vnd, payment_method, received_at) ON public.payments TO grafana_reader;
GRANT SELECT (id, shop_id, created_at) ON public.customers TO grafana_reader;
GRANT SELECT (id, actor_user_id, actor_role, shop_id, action, entity_type, entity_id, outcome, request_id, metadata, created_at) ON public.audit_logs TO grafana_reader;
GRANT SELECT (id, user_id, shop_id, started_at, last_message_at) ON public.chat_conversations TO grafana_reader;
GRANT SELECT (id, conversation_id, role, created_at) ON public.chat_messages TO grafana_reader;
GRANT SELECT (id, notification_event_id, user_id, read_at, created_at) ON public.notification_recipients TO grafana_reader;
```

Do not grant name, phone number, description, chat `content` or `metadata`, or `new_data`/`old_data` columns. Supabase allows custom roles through the shared pooler; take the username verbatim from the string at Dashboard → Connect → Session pooler (in the form `<role>.<project-ref>`), not assembled from the role name and region. After creating it, check `SELECT current_user` through the actual datasource to be sure the pooler maps to the right role.

Only three tables in the list have RLS today: `user_daily_activity` (the policy above), `agent_memories` and `agent_memory_settings` (no grant). At rollout, run `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity` in each environment; a table with RLS enabled and no policy for `grafana_reader` will return empty, and a policy is added only after reviewing inherited privileges.

### 7.2 Datasource

Two datasources in [`datasources.yaml`](../../../deploy/monitoring/grafana/provisioning/datasources/datasources.yaml), uid `smartledger-staging-pg` and `smartledger-production-pg`, type `grafana-postgresql-datasource`, `sslmode: require`, `maxOpenConns: 1`, `maxIdleConns: 0`. Host, database, user and password come from the `SMARTLEDGER_<ENV>_PG_*` variables of the Grafana container; an environment missing the variables still has a datasource, but its panels show a connection error.

`maxIdleConns: 0` makes Grafana close the connection right after a query, without holding a pooler slot between refreshes. With 15 slots in total, set Core down to 8 and AI down to 4 through environment variables: `SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=8` (Core, no code change, already in the `.env.core` template) and `POSTGRES_POOL_MAX_SIZE=2`, `SQL_POOL_MAX_SIZE=2` (AI already defaults to 2). That makes 8 + 4 + 1 = 13, leaving 2 spare slots.

### 7.3 Provisioning, playbook and secrets

- The dashboard lives at [`deploy/monitoring/grafana/product/product.json`](../../../deploy/monitoring/grafana/product/product.json), outside the Infra provisioning folder because the provider reads subfolders too; a second provider puts it in the `Product` folder.
- The read login lives in Dopbase's `monitor` group with the keys already in the [`.env.monitor`](../../../secrets/templates/.env.monitor) template: `GRAFANA_PG_HOST`, `GRAFANA_PG_PORT` (default 5432), `GRAFANA_PG_DATABASE` (default `postgres`), `GRAFANA_PG_USER`, `GRAFANA_PG_PASSWORD`. [`run.sh`](../../../scripts/infra/run.sh) loads this file together with `.env.vps`.
- The playbook writes `postgres-<environment>.env` (0600, `no_log`) next to monitoring's `.env`; Compose reads both files as optional `env_file`s. Each environment writes only its own file, so a staging run does not erase the production datasource as it would with a shared `.env`.
- If the host is empty, the playbook skips this step; the dashboard is still provisioned but the SQL panels show a connection error.

## 8. Dashboard specification

Dashboard `smart-ledger-product`: tag `smart-ledger` to join the shared link bar, `editable: false`, 5-minute refresh, default 7 days, timezone `Asia/Ho_Chi_Minh`. The `env` variable (staging, production) selects both the `smartledger-${env}-pg` datasource and Prometheus's `env` label. The SQL lives in the JSON; every user and shop metric excludes accounts whose email has `loadtest+` (for shops: by owner).

| Row | Panel | Source |
|---|---|---|
| Users | DAU, WAU, MAU of OWNER; stickiness (30-day average DAU / MAU); new owners and shops in the period | `user_daily_activity`, `users`, `shops` |
| Users | DAU by role per day; new owners and shops per day | as above |
| Retention | Cohort table by signup week (Monday, Vietnam time), the 12 most recent cohorts, columns W0–W8 are the % of owners still active in week n; cells for weeks not yet reached are left blank | `users`, `user_daily_activity` |
| Shops and activation | Active shops per week; funnel create shop → has products → `CONFIRMED` order within 7 days → uses AI | `audit_logs`, `shops`, `products`, `sales`, `chat_conversations` |
| Feature adoption | Distinct shops per week by group `SALE_*`, `PRODUCT_*`, `CATEGORY_*`, `STOCK_ADJUSTED`, `EXPENSE_*`, `DEBT_*` | `audit_logs` |
| AI | Conversations and shops using the assistant per day; `AI_VOICE`/`MANUAL` drafts and the number of AI drafts confirmed per week | `chat_conversations`, `sale_drafts` |
| AI | Calls and p95 by `handler` | Prometheus `http_requests_total`, `http_request_duration_seconds_bucket` of AI (the recording rule dropped the `handler` label) |
| Business | Confirmed and voided orders per day by `sold_at`; revenue of confirmed orders | `sales` |
| Data freshness | Age of the newest record in `audit_logs`, `sales`, `user_daily_activity` | as named |
| Events (collapsed) | The 500 newest events, filtered by the `action` and `shop` variables | `audit_logs` |

Retention can only be computed for about 12 weeks because `user_daily_activity` keeps 90 days; looking further back needs a weekly aggregate table, which is a Core change. Small cohorts fluctuate strongly, so read W1 and W4 across many rows.

## 9. Metric definitions

- **DAU:** distinct users with at least one successful business API request in a Vietnam day, per CORE-018; excludes `loadtest+` emails.
- **MAU:** distinct users in the 30 calendar days including today; not a calendar month. WAU is similar with 7 days.
- **Stickiness:** the 30-day average DAU divided by MAU.
- **Week-n retention:** among owners who signed up in the same week, the share with at least one active day in the nth week after the signup week. "Active" means one successful API request (CORE-018); the PO may settle a stricter definition, for example confirming an order in the week.
- **Active shop:** distinct shops with at least one `actor_role=OWNER` event in the window.
- **Activation:** a shop created in the window has its first `CONFIRMED` order within 7 days of `shops.created_at`; the 7-day window is an assumption that the PO must settle.
- **Feature adoption:** distinct shops with at least one action of the group in the window, divided by the number of active shops in the same window; show both the numerator and the denominator to avoid misreading a small ratio.
- **Void rate:** `VOIDED` orders divided by the total of `CONFIRMED` plus `VOIDED` by `sold_at`; a void today changes an old sales period. FR-006 counts by the time of the void; the dashboard counts by `sold_at` so confirmed and voided orders share one axis, and the PO must settle which way.
- **AI usage:** conversations started in the window; latency and errors come from Prometheus AI by `handler`.
- All day divisions use `Asia/Ho_Chi_Minh`; the dashboard sets a fixed timezone so it does not depend on the browser.

## 10. Privacy and security

- Do not grant PII and content columns to `grafana_reader`; check with `has_column_privilege` as in the [CORE-018 guide](../../../backend/core/docs/user-daily-activity.md#staging-evidence-required-before-closing-409).
- The role is read-only, `default_transaction_read_only`, 10-second timeout; do not use Core's credentials or the service role.
- The password lives only in Dopbase and the 0600 `.env` on the VPS; the playbook uses `no_log`. Do not put the connection string in the dashboard JSON, alerts or logs.
- The dashboard is `editable: false`, sign-up and anonymous access are off; only the Grafana ADMIN can view it.
- Production data shows only aggregate metrics and the listed columns, and no CSV is exported outside.

## 11. Operations

- 5-minute refresh, about 10 sequential queries on one connection each time; enough for the current small data.
- The time range is 7 days by default, up to 90 days; every panel filters by time and uses `LIMIT` for tables.
- A failing datasource (wrong password, out of slots) shows a connection error on each SQL panel; the Data freshness row has no value when the table is empty or the role lost read access.
- Rollback: remove the two datasources and the product dashboard from the repo and rerun the playbook; revoke the grants or drop the role when the owner decides. No data is changed.

## 12. Roadmap

| Phase | Content | Condition |
|---|---|---|
| P1 | Read role, two datasources, product dashboard with cohort retention | Already in the repo; still waiting for the ADR to be approved, the DB owner to create the role, `GRAFANA_PG_*` in Dopbase and the CORE-018 rollout for the user panels |
| P2 | Audit `USER_SIGNED_IN` in `/auth/session` (section 6.4); an intent event counter in Core at `/actuator/prometheus` with finite labels (`feature`, `outcome`), scraped by Alloy inside the app network like AI | The Core owner approves the scope of editing Core; a migration if the `audit_logs` constraint requires it |
| P3 | Client events: app sessions, failed sign-ins, the reason for being signed out, a funnel by UI step; an append-only `product_events` table or a client SDK if data leaving our infrastructure is accepted | A migration and a separate approval; a new ADR |

## 13. Verification

P1 must pass the following steps before it is considered done:

| Check | Method | Status |
|---|---|---|
| SQL runs correctly | A single-use PostgreSQL (as in CORE-018) loaded with sample data for every granted table; run each panel query through a local Grafana | Run on 2026-10-30: PostgreSQL 16 with every Core migration and the AI baseline's chat tables, the role created with the SQL in section 7.1, 44 owners (4 loadtest) and about 500 sample orders; Grafana 12.1.1 provisioned from the repo, every SQL query of the dashboard ran through `/api/ds/query` as `grafana_reader` and displayed correctly. No real data yet |
| Least privilege is enough for the dashboard | The same run as above | Run: no query needs a column outside section 7.1 |
| Minimal role | `has_column_privilege`, `has_table_privilege`, `rolsuper`, `rolbypassrls` on staging; confirm PII columns cannot be read | Not done |
| Pooler connection | The staging datasource uses `grafana_reader.<project-ref>`, TLS required, opens exactly one connection | Not done |
| Slot budget | Measure `pg_stat_activity` or the Supabase dashboard while Grafana refreshes every 5 minutes and Core runs a light load; must not exceed 13 slots | Not done |
| Playbook | Run the staging playbook and then production; the datasources of both environments stay configured after each run | Not done |
| Loadtest exclusion | Compare DAU/MAU with a manual count excluding `loadtest+` | Not done |
| Sample metrics | Create one shop, one product, one sale on staging; check that the funnel and adoption each rise by exactly one | Not done |

## 14. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Out of pooler slots when adding Grafana | Core cannot get a connection, requests fail | Lower Hikari to 8 and keep AI at 4 through environment variables; `maxIdleConns: 0`; measure before enabling production |
| Monitoring's `.env` overwritten per environment | The other environment's datasource is lost | Each environment writes its own `postgres-<environment>.env`, and Compose reads both |
| A table with RLS enabled and no policy | Panels return empty, easily misread as no users | Review `pg_tables.rowsecurity` in each environment before acceptance |
| Heavy queries on a small Supabase | Slow or costs egress | `statement_timeout` of 10 seconds, time filters, `LIMIT`, 5-minute refresh |
| `audit_logs` records only successes and whitelisted actions | Adoption misread as "used" instead of "tried" | A note on the dashboard; add intent in P2/P3 |
| The chat schema is managed by the AI baseline | Changing AI columns breaks panels | Panels use only stable columns in the ERD; add a check step when an AI migration changes the chat tables |
| CORE-018 not rolled out | No DAU/MAU | The panel states "no data until `USER_ACTIVITY_ENABLED` is turned on"; the other panels still run |

## 15. Open questions

- Is the north star metric DAU or weekly active shops? The ADR chooses to show both; the PO must settle which one leads.
- Does the 7-day activation window match real sales behavior?
- Should ADMIN usage count toward adoption, or only OWNER?
- Who owns the `grafana_reader` role in production, and who rotates the password?
- Is P2 part of the MVP, or does it wait for feedback from shop owners?
