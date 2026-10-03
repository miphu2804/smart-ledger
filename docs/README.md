# SmartLedger documentation

The documents in this directory are the source of truth for project scope and system contracts. Service READMEs explain how to run each part of the code.

## How to read the docs

Start with the path that matches your task; each step links to the next level of detail.

| Task | Read in this order |
|---|---|
| New to the project | [Project overview](product/project-overview.md) → [PRD §3 main flow](product/product-requirements.md#3-luồng-mvp-chính) → [Technical design §1](architecture/technical-design.md#1-phạm-vi) for what is built today → [Architecture diagram](architecture/diagrams/images/architecture.svg) for the MVP target |
| Change scope or requirements | [BRD](product/business-requirements.md) → [PRD](product/product-requirements.md) → acceptance criteria in PRD §8; keep `BO/BR → FR/NFR → AC` traceability |
| Build or call an API | [API contracts](contracts/api-contracts.md) → [Technical design §3–5](architecture/technical-design.md#3-luồng-chính) → [ERD description](architecture/erd-description.md) and [`erd.dbml`](architecture/diagrams/src/erd.dbml) |
| Understand a Core or AI code path | [Service walkthrough](architecture/service-walkthrough/README.md); it explains code, the documents above decide behavior |
| Run or deploy | [Root README](../README.md), [Core](../backend/core/README.md), [AI](../backend/ai/README.md), [Mobile](../frontend/mobile/README.md), [Web](../frontend/web/README.md), [CONTRIBUTING](../CONTRIBUTING.md), [`development/`](development/) |
| Work on mobile UI | [`design/`](design/) for visual direction and wording, then the mobile README |

### Target versus implemented

- BRD, PRD and the architecture diagram describe the **MVP target**. A requirement or diagram box does not mean the code exists.
- What is implemented today is recorded in one place: [Technical design §1](architecture/technical-design.md#1-phạm-vi). [API contracts](contracts/api-contracts.md) marks each endpoint as implemented or target. Other documents link there instead of restating status.
- Code on `staging` is the evidence for current behavior. When a document disagrees with it, fix the document in the same pull request. When code disagrees with the PRD, treat it as a bug or a requirement change and update the PRD and its acceptance criteria.
- Implemented is not accepted: a feature is done only when its `AC-*` pass on the integrated system.

### Conventions

- Keep each document in its current language: most of `docs/` and the frontend READMEs are Vietnamese; the root and backend READMEs and the ERD description are English. Code identifiers stay as written in code.
- Requirement documents start with a metadata table (`Trạng thái`, `Chủ sở hữu`, `Cập nhật lần cuối`).
- IDs are stable and never reused: `BO-*`, `BR-*`, `FR-*`, `NFR-*`, `AC-*`, `OQ-*`; invoice items use the `-INV-` infix.
- [`PROGRESS.md`](../PROGRESS.md) is an append-only log and [`BLOCKERS.md`](../BLOCKERS.md) lists open blockers; neither defines scope.

## Document map

| Document | Owns |
|---|---|
| [Project overview](product/project-overview.md) | Product position, users, MVP boundary |
| [Business requirements](product/business-requirements.md) | Outcomes, business rules, approvals |
| [Product requirements](product/product-requirements.md) | Observable behavior, `FR-*`, `NFR-*`, `AC-*` |
| [Technical design](architecture/technical-design.md) | Implementation status (§1), MVP components, data, flows, verification |
| [API contracts](contracts/api-contracts.md) | FE ↔ Core and Core ↔ AI contracts, per-endpoint status |
| [ERD description](architecture/erd-description.md) and [`erd.dbml`](architecture/diagrams/src/erd.dbml) | Database entities, relationships, data flows and migration alignment |
| [ADR-0001: pgvector vector store](architecture/adr/0001-vector-store-pgvector.md) | Accepted: embeddings in Supabase PostgreSQL instead of Qdrant |
| [Architecture diagram](architecture/diagrams/src/architecture.mmd) | MVP target system boundary; edit [`architecture.drawio`](architecture/diagrams/src/architecture.drawio) and re-export the [SVG](architecture/diagrams/images/architecture.svg) and [PNG](architecture/diagrams/images/architecture.png) together |
| [Environments diagram](architecture/diagrams/src/environments.mmd) | Clients, backend, Supabase staging/production, CI/CD; dashed edges are planned |
| [Service walkthrough](architecture/service-walkthrough/README.md) | Reading notes with diagrams of Core and AI service flows; not a source of truth |
| [Mobile UI style and migration](design/mobile-ui-style-migration.md) | Visual direction and implementation checks for the mobile app |
| [Mobile wording review](design/mobile-wording-review.md) | Proposed UI wording, icon and feedback mapping pending product approval |
| [Mobile iOS device release](development/mobile-ios-device-release.md) | Build and install a Release configuration on a connected iPhone |

## Which document to update

| Change | Update |
|---|---|
| Business scope or rule | BRD, then the PRD rows it hands off to |
| Product behavior | PRD requirement and its acceptance criteria |
| Endpoint, request or response | API contracts, including the endpoint status |
| Database schema | `erd.dbml` and the ERD description |
| Something becomes implemented | Technical design §1 and the endpoint status in API contracts |
| Architectural decision | A new ADR in [`architecture/adr/`](architecture/adr/) |
| Commands, env variables or setup | The README of the affected service |

Repository branching, review, and deployment rules are defined in [CONTRIBUTING.md](../CONTRIBUTING.md).
