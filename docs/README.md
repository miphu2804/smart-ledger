---
type: Guide
title: "SmartLedger documentation"
description: "Reading paths by task, source-of-truth rules and which document to update for each kind of change."
owner: Technical owner
status: stable
generated: { by: human:miphu2804, at: 2026-11-06T22:20:06+07:00 }
stale_after: 2027-01-05T22:20:06+07:00
---
# SmartLedger documentation

The documents in this directory are the source of truth for project scope and system contracts. Service READMEs explain how to run each part of the code.

## How to read the docs

Start with the path that matches your task; each step links to the next level of detail.

| Task | Read in this order |
|---|---|
| Complete the EXE201 MVP | [Course scope](product/project-overview.md) → [BRD priorities](product/business-requirements.md#3-phạm-vi-kinh-doanh) → [Demo and user validation](product/mvp-demo-validation.md); finish the existing end-to-end flow before optional integrations or architecture expansion |
| Integrate independent stock decreases | [CORE-021 contract](contracts/api-contracts.md#core-021-stock-decrease-adjustment) → [FR-038 / AC-111–115](product/product-requirements.md#điều-chỉnh-giảm-tồn-core-021--đã-duyệt-ngày-2026-11-02) → [Core handoff](../backend/core/docs/stock-adjustments.md); no migration, separate from stock-in, FE/staging acceptance pending |
| Integrate shared operation quotas | [API contract](contracts/api-contracts.md#core-019-operation-limits) → [Core transactions and V20 rollout](../backend/core/docs/user-rate-limits.md); default-off, commit-based, cross-instance, no shared-environment activation implied |
| New to the project | [Project overview](product/project-overview.md) → [PRD §3 main flow](product/product-requirements.md#3-luồng-mvp-chính) → [Technical design §1](architecture/technical-design.md#1-scope) for what is built today → [Architecture diagram](architecture/diagrams/images/architecture.svg) for the target architecture |
| Change scope or requirements | [BRD](product/business-requirements.md) → [PRD](product/product-requirements.md) → acceptance criteria in PRD §8; keep `BO/BR → FR/NFR → AC` traceability |
| Build or call an API | [API contracts](contracts/api-contracts.md) → [Technical design §3–5](architecture/technical-design.md#3-main-flows) → [ERD description](architecture/erd-description.md) and [`erd.dbml`](architecture/diagrams/src/erd.dbml); try requests with the [Bruno collection](../scripts/bruno/README.md) |
| Integrate Zalo web login/link | [Zalo contract](contracts/api-contracts.md#zalo-core-015) → [implementation status](architecture/technical-design.md#zalo-core-015) → [V17 rollout/recovery](architecture/erd-description.md#zalo-core-015-v17) → [Core setup](../backend/core/README.md#zalo-authentication-core-015-local-backend-implementation) |
| Integrate Zalo Android login/link | [Native contract](contracts/api-contracts.md#zalo-android-core-016) → [Core/V18 status](architecture/technical-design.md#zalo-android-core-016) → [V18 migration/recovery](architecture/erd-description.md#zalo-android-core-016-v18) → [staging activation after merge](../backend/core/docs/zalo-android-preparation.md#staging-activation-after-merge); runtime defaults off, staging configuration is prepared but not applied, APK/production acceptance remains separate |
| Integrate admin dashboard charts | [Growth API contract](contracts/api-contracts.md#daily-creation-series--admin-growth) → [implementation status](architecture/technical-design.md#daily-admin-overview--admin-growth) → [Core test handoff](../backend/core/docs/admin-dashboard-growth.md); no migration, current statuses stay separate from daily creation counts, FE/staging acceptance pending |
| Integrate DAU/MAU monitoring | [FR-036 / acceptance criteria](product/product-requirements.md#hoạt-động-người-dùng-core-018--đã-duyệt-ngày-2026-10-29) → [V19 schema](architecture/erd-description.md#core-018-v19) → [Core rollout and read-only Grafana SQL](../backend/core/docs/user-daily-activity.md); defaults off, no shared-DB migration or Grafana provisioning implied |
| Understand a Core or AI code path | [Service walkthrough](architecture/service-walkthrough/README.md); it explains code, the documents above decide behavior |
| Audit Core documentation against code | [Core module map](architecture/technical-design.md#core-audit-map--2026-10-26) → [API contracts](contracts/api-contracts.md) → [ERD](architecture/erd-description.md) → [diagram scopes](architecture/diagrams/README.md#reading-scope--core-audit-2026-10-26); current code, target architecture, dated snapshots and mock captures have different evidential roles |
| Run or deploy | [Local development](development/local-development.md), [Core](../backend/core/README.md), [AI](../backend/ai/README.md), [Mobile](../frontend/mobile/README.md), [Web](../frontend/web/README.md), [CONTRIBUTING](../CONTRIBUTING.md), [`development/`](development/) |
| Work on mobile UI | [`design/`](design/) for visual direction and wording, then the mobile README |

### Target versus implemented

- SmartLedger runs in production. BRD, PRD and the architecture diagram describe the **target scope** of the first release (labelled MVP); a requirement or diagram box does not mean the code exists, is deployed or is accepted.
- What is implemented today is recorded in one place: [Technical design §1](architecture/technical-design.md#1-scope). [API contracts](contracts/api-contracts.md) marks each endpoint as implemented or target. Other documents link there instead of restating status.
- Code on `staging` is the evidence for current behavior. When a document disagrees with it, fix the document in the same pull request. When code disagrees with the PRD, treat it as a bug or a requirement change and update the PRD and its acceptance criteria.
- The current delivery goal is the EXE201 course MVP: a working core demo, understandable UX and real user feedback. Keep implemented capabilities; advanced infrastructure and optional integrations are not prerequisites for the course demo. See the [PRD delivery priorities](product/product-requirements.md#11-ưu-tiên-hoàn-thành-môn-exe201).
- Implemented is not accepted: a feature is done only when its `AC-*` pass on the integrated system.

### Conventions

- Write documents in English, except the business and product documents in [`product/`](product/), which stay in Vietnamese for the product owner and the team. Code identifiers stay as written in code, and Vietnamese UI copy stays Vietnamese wherever it is quoted.
- Every document starts with an [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) (OKF v0.2) frontmatter block: `type`, `title`, a one-sentence `description`, `owner`, `status` (`draft`, `stable` or `deprecated`), `generated: { by, at }` for the last meaningful change, and `stale_after` (60 days later) for documents that describe living behavior; ADRs have no `stale_after`. `generated.by` is `human:<GitHub login>` of the person who made the change, and every timestamp uses Vietnam time with the `+07:00` offset. Requirement documents keep a metadata table below the title for the narrative status and approvers.
- Repository documents outside `docs/` (service READMEs, `backend/core/docs/`, `CONTRIBUTING.md` and the others listed under "Repository docs outside docs/" in [`index.md`](index.md)) follow the same frontmatter rules; list a new one there.
- IDs are stable and never reused: `BO-*`, `BR-*`, `FR-*`, `NFR-*`, `AC-*`, `OQ-*`; invoice items use the `-INV-` infix.
- [`PROGRESS.md`](../PROGRESS.md) is a newest-first log of recent work (200 lines or fewer, older entries in Git history) and [`BLOCKERS.md`](../BLOCKERS.md) lists open blockers; neither defines scope.

## Document map

[`index.md`](index.md) is the OKF bundle root: it lists every document in `docs/` and the repository documents outside it, each with a one-line description, and links an `index.md` for every folder with two or more entries. The indexes are kept by hand under the docs rules in [`AGENTS.md`](../AGENTS.md): each entry repeats its document's frontmatter title and description and changes in the same pull request as the document. Diagram sources, exports and their editing rules are in the [diagram guide](architecture/diagrams/README.md).

## Which document to update

| Change | Update |
|---|---|
| Business scope or rule | BRD, then the PRD rows it hands off to |
| Product behavior | PRD requirement and its acceptance criteria |
| Endpoint, request or response | API contracts, including the endpoint status |
| Database schema | `erd.dbml` and the ERD description |
| Something becomes implemented | Technical design §1 and the endpoint status in API contracts |
| Architectural decision | A new ADR in [`architecture/adr/`](architecture/adr/) |
| Commands, env variables or setup | The README of the affected service; cross-service setup, Compose and migrations in [Local development](development/local-development.md) |

Repository branching, review, and deployment rules are defined in [CONTRIBUTING.md](../CONTRIBUTING.md).
