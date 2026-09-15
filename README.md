# SmartLedger

## Repository Layout

Documentation-first MVP. **Verified:** BRD/PRD remain provisional and architecture remains a proposal. The application folders contain placeholder files, not a working runtime. Java/Python and hosting are not finalized.

```text
smart-ledger/
├── README.md
├── AGENTS.md
├── CLAUDE.md
├── PROGRESS.md
├── docs/
│   ├── product/          # product description, BRD, PRD
│   ├── architecture/     # overview, technical design, ADRs
│   └── contracts/        # HTTP/wire contracts
├── frontend/             # FE app; chỉ gọi Core public API
├── backend/
│   ├── core/             # proposed Core API (Java candidate), DB owner
│   └── ai/               # proposed internal text parser (Python candidate)
```

## References

| Document | Description |
|---|---|
| [Documentation Index](docs/README.md) | Map, lifecycle, and source-of-truth rules |
| [Project overview](docs/product/project-overview.md) | Product, audience, and boundaries |
| [Architecture diagram](docs/architecture/diagrams/src/architecture.mmd) | MVP target system boundary |
| [Technical design](docs/architecture/technical-design.md) | Proposed MVP design, pending review |
| [Progress log](PROGRESS.md) | Append-only completion log |
| [`AGENTS.md`](AGENTS.md) | Canonical project instructions for coding agents |
| [`CLAUDE.md`](CLAUDE.md) | Imports `AGENTS.md` for Claude |
| [Contributing guide](CONTRIBUTING.md) | Branch, commit, and pull request conventions |
