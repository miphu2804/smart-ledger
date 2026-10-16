# Load testing and monitoring

**Status: proposal.** The SLO targets below have no owner or approval yet; they are starting points to measure against, not requirements or an SLA. They become requirements only as `NFR-*` rows in the [PRD](../product/product-requirements.md) once the product owner approves them. No load test has been run against staging or production; there is no measured capacity figure yet. `AC-062` already states that local timings are not a production SLA.

This document covers what is tested and watched in staging and production, how to find how much load production can take, and what is missing. How to run the tools: [`scripts/loadtest/README.md`](../../scripts/loadtest/README.md) and [`scripts/monitor/probe.py`](../../scripts/monitor/probe.py). Deployment flow: [CI/CD](ci-cd.md).

## Test types

| Type | Question | Where it runs | State |
|---|---|---|---|
| Unit and integration | Does the code do what the contract says | CI on every PR (`ai`, `core` with PostgreSQL, `mobile-web`) | In place |
| Migration | Do migrations apply to an empty database | CI job `core` | In place |
| Web smoke | Does the deployed web load and pass Core CORS | CI job `deploy-web` after each deploy | In place |
| Synthetic probe | Are Core, its database and the web up right now | [`synthetic-monitor.yml`](../../.github/workflows/synthetic-monitor.yml), every 10 minutes | New, see [Monitoring](#monitoring) |
| Smoke load | Does the load scenario work against this environment | `scripts/loadtest`, profile `smoke` | New |
| Load | Does the expected concurrent load meet the SLO | profile `load` | New |
| Stress | At what load does it break, and how | profile `stress` | New |
| Spike | Does it survive a sudden jump and recover | profile `spike` | New |
| Soak | Does it leak memory or connections over an hour | profile `soak` | New |
| Backend post-deploy smoke | Does Core answer after a Railway deploy | Not built; the `deploy` job does not probe Core | Gap |

Locust only sends HTTP requests, so it tests Core (Java) and, through Core's Agent proxy, AI (Python) the same way. The scenario is written in Python; the services under test can be in any language.

## How much load production can take

The figure to produce is "production serves **N** concurrent OWNERs with p95 under **Z** ms and under 1% errors". It holds only when each branch below holds:

```text
Claim: production serves N concurrent OWNERs, p95 < Z ms, errors < 1%
├── A. Measured: profile `load` at N users passes the SLO gate
│   ├── A1. The environment matches production
│   │       same Railway plan and replica count, same Supabase compute size and region
│   ├── A2. The data matches production volume
│   │       lists and reports cost more as rows grow (AC-062: deep OFFSET and count cost)
│   └── A3. The user model matches real use
│           task mix and think time are assumptions until analytics exist
├── B. Headroom: profile `stress` reaches at least 1.5–2 × N before it breaks
│       so a busy hour or a spike does not take it down
└── C. Stability: profile `soak` at 70% of the ceiling for 60 minutes
        memory, DB connections and p95 stay flat
```

Running only `stress` gives B, not the claim: without A1–A3 the number describes a different system.

### Expected limits before measuring

Read from the configuration on `staging`; none of these is measured.

| Component | Setting | Why it can limit |
|---|---|---|
| Core DB pool | No `spring.datasource.hikari` override in `application.yml`, so HikariCP's default of 10 connections per replica applies | Every request touching the database holds one of these. Throughput ≈ 10 ÷ (database time per request): 20 ms gives about 500 req/s, 100 ms about 100 req/s. Beyond that requests queue in the pool, then fail |
| Supabase connections | The [AI README](../../backend/ai/README.md#routes-and-database-access) records that the Supabase session pooler (port 5432) allows 15 clients in total, with Core opening up to 10 and AI up to 4 (`POSTGRES_POOL_MAX_SIZE` 2 + `SQL_POOL_MAX_SIZE` 2). Direct connections have their own per-compute cap (60 on Nano/Micro per the [Supabase limits page](https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits)) | One Core replica plus AI already uses 14 of 15 clients. A second Core replica does not fit without a smaller Hikari pool or the transaction pooler, so scaling Core out is a configuration decision, not just a replica count |
| Core threads | Tomcat default of 200 request threads | Reached only when requests wait on something slow, such as the AI proxy (up to 60 s async timeout) |
| AI chat | Chat handlers are `async`; a turn is cut at `AGENT_TURN_TIMEOUT_SECONDS` (35 s by default) | Bound mostly by the model provider's rate limits and latency, not CPU; the 4 AI database connections also cap concurrent tool calls. Test it separately, with a request cap |
| Firebase | ID tokens are verified by the Admin SDK in Core | Inferred to be local signature checks with cached keys, so not a per-request network call; confirm in the stress run |

### How to run the measurement

1. Pick the environment. Staging works only if its Railway plan, replicas and Supabase compute match production; otherwise create a production-like environment. Staging shares its database with dev, so a stress run there slows dev too.
2. Seed data: test shops with production-like numbers of products, sales and customers.
3. Run `smoke`, then `load` at the expected peak. Without traffic data, start from a guess (for example 50) and say so in the result.
4. Run `stress` to find the ceiling, `spike` at twice the peak, then `soak` at 70% of the ceiling.
5. During every run, watch the [server-side signals](#monitoring) next to Locust: Railway CPU and memory of `core`, Supabase connections and slow queries. A Locust p95 rising while Core CPU is idle points to the database pool or the database.
6. Record each result in [`PROGRESS.md`](../../PROGRESS.md) with commit, environment sizes, data volume, profile settings and the Locust CSV/HTML.

To compare with real traffic: a Locust user with 3–10 s think time sends about one request every 6–7 s, roughly one person actively using the app. Concurrent users (CCU) are therefore close to Locust users at the default think time. Daily active users (DAU) are not concurrent; the peak CCU of a day is usually a small share of DAU, but that share has to come from analytics.

## SLI and SLO proposal

An SLI (service level indicator) is a measured ratio; an SLO (service level objective) is the target for it over a window; an SLA is a contractual promise with consequences. SmartLedger has none of these today; the table proposes the first two.

| SLI | Measured by | Proposed SLO (30-day window) |
|---|---|---|
| Availability: probe checks that pass | Synthetic probe now; an external uptime checker later | 99.5% |
| Availability: Core API responses that are not 5xx | Needs request metrics from Core, see [Gaps](#gaps) | 99.5% |
| Latency: `read` requests under 500 ms | Locust during tests; Core metrics in production later | 95% |
| Latency: `report` and `write` requests under 1 s | Same | 95% |
| Agent chat: answered without `ai_unavailable` within 20 s | Locust during tests; Core metrics later | 95% |

Error budget is the unavailability the SLO allows: 30 days × 24 h × 60 min = 43,200 min, so 99.5% allows 216 min (3 h 36 min) a month and 99.9% allows 43 min. With a probe every 10 minutes, one failed run counts as up to 10 minutes down, so the probe can only tell whether the budget is roughly kept. 99.5% is proposed because there is one Core replica, manual rollback and no on-call; a higher target needs those first.

The load-test gate in [`slo.py`](../../scripts/loadtest/slo.py) uses the same latency limits and a 1% error ceiling. Change both together.

## Monitoring

| Layer | Watch | Tool available now | During a load test |
|---|---|---|---|
| Uptime | Core liveness and readiness (readiness includes the database), Core auth gate returns 401, web returns 200 | [`synthetic-monitor.yml`](../../.github/workflows/synthetic-monitor.yml) | Not needed |
| Core and AI runtime | CPU, memory, network, restarts, logs | Railway service metrics and logs | Yes: CPU near the limit or memory climbing in `soak` |
| AI agent turns | Time per turn, per model call and per tool call, token counts, errors, by `shop_id` | Logfire, when `LOGFIRE_TOKEN` is set ([AI README](../../backend/ai/README.md#tracing-logfire)); no message content is sent | Yes for chat runs: splits a slow turn into model time and tool time |
| Database | Connections, CPU, slow queries | Supabase dashboard: Reports and Query Performance | Yes: connections near the limit, new slow queries |
| Redis | Memory, connections | Redis Cloud dashboard | Low priority; no AI feature reads Redis yet |
| Web | Deploy state, runtime errors | Vercel dashboard | No |
| Client view | Request rate, p50/p95/p99, failures per endpoint | Locust web UI, `--csv`, `--html` | Yes |
| Product use | DAU, MAU, CCU | None integrated | — |

The synthetic monitor runs every 10 minutes and on demand (Actions → **Synthetic monitor** → **Run workflow**). It opens one issue titled *Synthetic monitor failing* when a check fails twice in a row within a run, comments on it while the failure lasts, and closes it on the next passing run. GitHub runs schedules only from the default branch, so it starts after this file reaches `main`, and it may delay or skip runs under load; treat it as a backup signal. Repository variables (Settings → Secrets and variables → Actions → Variables):

| Variable | Default |
|---|---|
| `MONITOR_STAGING_CORE_URL` | `https://core-staging-01d2.up.railway.app` |
| `MONITOR_STAGING_WEB_URL` | `https://smart-ledger-staging.vercel.app` |
| `MONITOR_PRODUCTION_CORE_URL` | None: production Core is not probed until this is set |
| `MONITOR_PRODUCTION_WEB_URL` | `https://smart-ledger-prod.vercel.app` |

AI has no public domain and is not probed; Core readiness does not include AI. Only a chat through Core checks it end to end.

## Gaps

Each needs a decision or work outside this change.

| Gap | Effect | Option | Decision by |
|---|---|---|---|
| Core exposes only `health` from Actuator; no request rate, latency or DB-pool metrics | The availability and latency SLOs cannot be measured on real traffic, only in tests | Add Micrometer with a Prometheus endpoint, or the OpenTelemetry Java agent, sending to a hosted backend such as Grafana Cloud | Core owner |
| Logfire covers AI agent runs only: FastAPI requests are not instrumented and Core has no traces | A slow chat cannot be followed from Core into AI in one trace | OpenTelemetry in Core with trace propagation to AI, under the `NFR-008` rule of no tokens or raw media in traces | Core and AI owners |
| Session pooler at 15 clients with 14 in use | Scaling Core to a second replica, or raising AI pools, exhausts database clients | Set an explicit Hikari pool size per replica, or move Core to the transaction pooler; measure with `stress` before and after | Core owner |
| No external uptime checker | GitHub schedules are best effort and can be skipped | A hosted checker (for example UptimeRobot, Better Stack or Checkly) at 1–5 minute intervals hitting the same URLs | Product owner (account and cost) |
| No product analytics | No DAU or CCU, so the load model is a guess | Firebase Analytics in the mobile app (the project already uses Firebase), or PostHog | Product owner (privacy review first) |
| No backend post-deploy smoke | A deploy can succeed while Core cannot reach AI (see [CI/CD](ci-cd.md#railway-service-variables)) | Run `probe.py` for the deployed environment at the end of the `deploy` job | CI owner |
| No alert routing beyond the GitHub issue | Nobody is paged | Route the issue or the uptime checker to a chat channel | Team |
