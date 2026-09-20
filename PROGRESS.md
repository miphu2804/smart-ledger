### [2026-09-20 17:26 UTC+07:00] — [Docs] Finalize Phase 1 ERD and core validation rules

**Done:** Scoped product barcode uniqueness to `(store_id, barcode)`, moved `store_id` to `notification_events`, converted `auth_identities` to 1:N, and documented tenant consistency and payment-debt validation rules.

**Changed files:**
- `docs/architecture/diagrams/src/erd.dbml` — updated product barcode index, notification tables, and auth identities
- `docs/architecture/diagrams/src/erd.dbdiagram` — synchronized store-notification relationship
- `docs/architecture/erd-description.md` — added core business validation rules and updated entity descriptions

**Flow explained:** Barcodes are unique per store; notifications and auth identities support multi-recipient and multi-provider flows; business integrity is enforced at service layer.

**Check:** Verified DBML schema syntax and cross-document references.

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
### [2026-09-18 UTC+07:00] — [Docs] Align Phase 1 ERD and technical design

**Done:** Updated the Phase 1 ERD, its description, and technical design to use Firebase Phone/Google, `store_id`, persisted sale drafts, sales/payments/debts, simple stock, AI trace, idempotency, archive/void lifecycle, `BIGINT` VND, and UTC timestamps.

**Changed files:** `docs/architecture/diagrams/src/erd.dbml`, `docs/architecture/erd-description.md`, and `docs/architecture/technical-design.md`.

**Check:** Ran `git diff --check`; DBML remains a logical schema and PostgreSQL constraints/indexes must be implemented in Flyway migrations.
