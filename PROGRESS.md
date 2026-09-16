### [2026-09-16 20:40 UTC+07:00] — [Feature] Prototype admin support dashboard

**Done:** Scaffolded a Vite React admin app and shipped mock screens for Dashboard, Customers (shop drawer), AI Support, Tasks kanban, and Settings. Data is local mock shaped to admin contract names; Core is not called.

**Changed files:**
- `frontend/` — Vite + React 19 + Tailwind v4 prototype
- `PROGRESS.md`, `BLOCKERS.md` — log and Hiep assignee blocker

**Flow explained:** ADMIN chrome with Support nav. Dashboard and Customers are P0. AI Support, Tasks, and Settings are mock P1. No login, no OWNER impersonation, no ledger writes.

**Check:** `pnpm build` passed. Visual review against Elera-style refs at 1440–1680 CSS px.

### [2026-09-16 00:00 UTC+07:00] — [Fix] Pin setup-uv action version

**Done:** Replaced unresolved `astral-sh/setup-uv@v10` with `v10.1.0` so CI can resolve the action.

**Changed files:**
- `.github/workflows/ci.yml` — modified

**Flow explained:** GitHub Actions has no floating `v10` tag; the workflow now pins a released tag.

**Check:** Confirmed `v10` 404 and `v10.1.0` exists via GitHub API. CI run on the PR is unverified until Actions starts.

### [2026-09-15 23:41 UTC+07:00] — [Feature] Set up Python AI runtime; leave Java Core

**Done:** Scaffolded FastAPI `/health` for AI (`:8001`) with uv, ruff, and pytest. Left Core as Java; did not record an ADR for the scaffold.

**Changed files:**
- `backend/ai/` — created FastAPI app, config, tests, lockfile
- `backend/core/` — left as Java placeholder; Python files removed
- `docs/architecture/technical-design.md` — Java Core, Python AI env names
- `README.md`, `AGENTS.md`, `docs/README.md` — Core is Java, do not modify
- `.github/workflows/ci.yml`, `.pre-commit-config.yaml` — AI only

**Flow explained:** AI starts on `:8001`; `GET /health` returns `{"status": "ok"}`. Core stays Java. Internal `/internal/v1` is not implemented.

**Check:** `uv run ruff check`, `uv run ruff format --check`, and `uv run pytest` passed in `backend/ai` (1 test).

### [2026-09-15 21:50 UTC+07:00] — [Docs] Initialize project documentation

**Done:** Initialized the MVP product, architecture, API contract, delivery workflow, and backlog documentation.

**Changed files:** `README.md`, `CONTRIBUTING.md`, `docs/`, `PROGRESS.md`, and `BLOCKERS.md`.

**Flow explained:** `Business requirements → product requirements → technical design → API contract → sprint issues`.

**Check:** Validated Markdown whitespace, DBML, and draw.io sources; visually inspected the architecture export.
