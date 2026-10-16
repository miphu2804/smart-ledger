# Load tests

[Locust](https://docs.locust.io/) scenarios that drive SmartLedger Core over HTTP as OWNER app sessions. Core proxies Agent chat to AI, so AI is load-tested only through `/api/v1/agent/*`. Design, proposed SLOs and how to read results: [Load testing and monitoring](../../docs/development/load-testing-and-monitoring.md).

## Setup

```bash
cd scripts/loadtest
uv sync
cp accounts.example.csv accounts.csv   # test OWNER accounts, never real shops
```

Each account in `accounts.csv` needs an Email/Password Firebase user in the target environment's project, a Core profile and one `ACTIVE` shop. The run opens a Core session per Locust user (`POST /api/v1/auth/session`) and uses the first `ACTIVE` shop. Use at least one account per ten users; for write runs, one account per user, because users sharing a shop also share its row locks. `accounts.csv` is git-ignored.

`FIREBASE_API_KEY` is the Web API key of that Firebase project (the same value as `EXPO_PUBLIC_FIREBASE_API_KEY`). Tokens are fetched once per account and refreshed before they expire; Firebase calls are not counted in the results.

For a local Core with the Auth emulator, set `AUTH_MODE=static` and put one ID token per line in `tokens.txt` (git-ignored).

## Run

Run from a machine in the same region as Railway, not a laptop on Wi-Fi. Every command needs `TARGET_ENV` (`local`, `staging` or `production`) and `--host` (the Core base URL); the run refuses to start without them.

```bash
# Smoke: 2 users for 60 s, checks the scenario before a long run
TARGET_ENV=staging LOAD_PROFILE=smoke FIREBASE_API_KEY=... \
  uv run locust --headless -H https://core-staging-01d2.up.railway.app \
  --csv reports/smoke --html reports/smoke.html

# Load: ramp to PEAK_USERS, hold 10 minutes
TARGET_ENV=staging LOAD_PROFILE=load PEAK_USERS=50 FIREBASE_API_KEY=... \
  uv run locust --headless -H https://core-staging-01d2.up.railway.app \
  --csv reports/load --html reports/load.html

# Interactive: web UI on :8089, users and spawn rate set by hand
TARGET_ENV=staging FIREBASE_API_KEY=... uv run locust -H https://core-staging-01d2.up.railway.app
```

The exit code is `1` when the SLO gate fails, `2` when the settings are refused, so a CI job can use it.

| `LOAD_PROFILE` | Shape | Answers |
|---|---|---|
| `manual` (default) | `-u`/`-r` or the web UI | Exploration |
| `smoke` | 2 users, `HOLD_SECONDS` (60) | Does the scenario work at all |
| `load` | Ramp over `RAMP_SECONDS` (120) to `PEAK_USERS` (50), hold `HOLD_SECONDS` (600) | Does the expected load meet the SLO |
| `stress` | `STRESS_STEPS` (10) steps of `STEP_USERS` (`PEAK_USERS/5`), `STEP_SECONDS` (300) each; stops after the first step over `STRESS_STOP_FAIL_RATIO` (0.05) or `STRESS_STOP_P95_MS` (3000) | Where it breaks; the last healthy step is the ceiling |
| `spike` | `PEAK_USERS/10` for 2 min, `PEAK_USERS × SPIKE_MULTIPLIER` (2) for 3 min, back to baseline for 3 min | Does it survive a sudden jump and recover |
| `soak` | 70% of `PEAK_USERS` for `HOLD_SECONDS` (3600) | Leaks: memory, DB connections, tokens over time |

Think time per user is `THINK_MIN_SECONDS`–`THINK_MAX_SECONDS` (3–10 s). Each user then sends roughly one request every 6–7 seconds, close to one person using the app; lowering it makes one Locust user stand for many people.

### Writes and chat

Off by default. Both create data in the target database.

| Variable | Effect |
|---|---|
| `LOADTEST_WRITES=1` | Adds draft → confirm (a 1,000 VND sale, item `[loadtest] item`) and an expense `[loadtest] expense` with a fresh `Idempotency-Key`. Staging shares its database with dev: use dedicated test shops and archive them afterwards |
| `CHAT_USERS=N`, `CHAT_MAX_REQUESTS=M` | N users ask one Agent question per new conversation, then delete it, until M questions in total. Each question calls the model and costs money; the cap is per Locust process |

### Production

Production rejects writes and chat. It also needs `LOADTEST_CONFIRM_HOST` equal to `--host`, and `stress`/`spike` additionally need `LOADTEST_ALLOW_PRODUCTION_STRESS=yes`. Prefer a production-like environment (same Railway plan and replicas, same Supabase compute size, seeded data) for stress and spike; on real production, run `smoke` or a short `load` in a low-traffic window, announced in advance.

### SLO gate

At the end the run prints a table per request name and fails when the failure ratio exceeds `SLO_MAX_FAIL_RATIO` (0.01) or a p95 exceeds its group limit. Names below `SLO_MIN_SAMPLES` (20) requests are reported as `few-samples` and do not fail the run.

| Group | Requests | p95 limit (ms) | Override |
|---|---|---|---|
| `auth` | `POST /auth/session` | 1000 | `SLO_P95_AUTH_MS` |
| `read` | Lists, notification count | 500 | `SLO_P95_READ_MS` |
| `report` | `/reports/*` | 1000 | `SLO_P95_REPORT_MS` |
| `write` | Draft, confirm, expense | 1000 | `SLO_P95_WRITE_MS` |
| `chat` | `/agent/*` | 20000 | `SLO_P95_CHAT_MS` |

These limits are provisional starting points, not agreed SLOs.

### More load than one machine

One Locust process uses one CPU core. Use `--processes -1` for all cores on the machine, or `--master` and `--worker --master-host=<ip>` across machines. Watch the load generator's CPU: above about 90% the results measure Locust, not Core.
