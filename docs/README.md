# SmartLedger documentation

The documents in this directory are the source of truth for project scope and system contracts.

| Document | Owns |
|---|---|
| [Project overview](product/project-overview.md) | Product position, users, MVP boundary |
| [Business requirements](product/business-requirements.md) | Outcomes, business rules, approvals |
| [Product requirements](product/product-requirements.md) | Observable behavior, `FR-*`, `NFR-*`, `AC-*` |
| [Technical design](architecture/technical-design.md) | MVP components, data, flows, verification |
| [API contracts](contracts/api-contracts.md) | FE ↔ Core and Core ↔ AI contracts |
| [Architecture diagram](architecture/diagrams/src/architecture.mmd) | MVP target system boundary |
| [ERD description](architecture/erd-description.md) | Database entities, relationships & OCR flows |

Preserve traceability as `BO/BR → FR/NFR → AC`. A component in the target diagram is not complete until its observable behavior and acceptance criteria pass.

Repository branching, review, and deployment rules are defined in [CONTRIBUTING.md](../CONTRIBUTING.md).
