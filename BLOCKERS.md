## Open verification dependencies

### [2026-11-07] — [Acceptance] Integrated admin growth acceptance is not verified

**Status:** Open

**Blocked by:** PR #368 merged on 2026-10-26 as `d4dc743e3315368eea5980d074aacc9e05af9e4f`; its Core and container-image checks succeeded. The documentation audit did not run Firebase/FE integration, staging smoke/UAT, production acceptance or a real load evaluation.

**Impact:** The API is implemented and merged, but the local regression and successful PR checks do not establish integrated acceptance or the currently deployed/enabled state.

**Next action:** The feature/integration owner records the tested build and environment and completes the [Core handoff](backend/core/docs/admin-dashboard-growth.md). Check current delivery evidence separately: CI on `staging` commit `a2766ee` succeeded ([run 42251227949](https://github.com/miphu2804/smart-ledger/actions/runs/42251227949)), while that revision's [CD run](https://github.com/miphu2804/smart-ledger/actions/runs/42251883849) and [infra run](https://github.com/miphu2804/smart-ledger/actions/runs/42251227926) failed; their causes and remediation were not verified by this docs-only audit. No environment change is authorized here.

## Resolved history

### [2026-10-26] — [CI] PR #368 runner/billing interruption

**Status:** Resolved

**Blocked by:** Historical [CI #785](https://github.com/miphu2804/smart-ledger/actions/runs/40218136882) lost its self-hosted runner connection before build/test; [CI #786](https://github.com/miphu2804/smart-ledger/actions/runs/40277351366) waited for a runner; [CI #787](https://github.com/miphu2804/smart-ledger/actions/runs/40278406256) was blocked before assignment by the owner's billing lock and its summary then failed in `fromJSON`. The optional artifact upload warning did not cause the Core/container failures.

**Impact:** These runs did not provide passing PR evidence at the time. They are not current blockers for the already merged PR.

**Resolution:** Verified through GitHub on 2026-11-07: [PR #368](https://github.com/miphu2804/smart-ledger/pull/368) is merged; `core`, `container-images` and `CI result summary` completed successfully. This does not prove that all later CI/CD runs or production execution passed.

**Next action:** None for the historical PR interruption; use the open verification dependency above for integration acceptance.

### [2026-10-26] — [Validation] PostgreSQL regression for admin growth completed

**Status:** Resolved

**Blocked by:** Docker Desktop previously reported a process error and the CLI could not connect to the Linux engine. The user restored Docker; the rerun completed.

**Resolution:** Historical local evidence: `mvnw.cmd -B verify` on commit `976be02` in a clean temporary checkout, with its own PostgreSQL 16.15, reached BUILD SUCCESS: 1,422 tests, no failures/errors/skips. Totals were checked against XML testcases, including 22 controller tests and 18 PostgreSQL dashboard tests with a UTC DB session assertion. Local log: `backend/core/target/admin-growth-full-verify-20261026.log` (ignored). No local/staging/production business DB was used and no migration was created. These tests were not rerun in this documentation change.

**Next action:** None for the completed local regression; FE/staging/load acceptance remains separate.

### [2026-09-15] — [Planning] Dashboard issue assignment

**Status:** Resolved

**Blocked by:** Hiep's GitHub username and collaborator access were unknown at the time.

**Impact:** #17–#19 originally had no GitHub assignee.

**Resolution:** Verified through GitHub on 2026-11-07: issues [#17](https://github.com/miphu2804/smart-ledger/issues/17), [#18](https://github.com/miphu2804/smart-ledger/issues/18) and [#19](https://github.com/miphu2804/smart-ledger/issues/19) are closed and assigned to `orei1i`.

**Next action:** None; do not recreate the historical assignment blocker.
