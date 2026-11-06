### [2026-10-26] — [CI] PR #368 waits for a runner or the repository owner's billing fix

**Status:** Open

**Blocked by:** [CI #785](https://github.com/miphu2804/smart-ledger/actions/runs/40218136882) lost its self-hosted runner connection before the build/test step. [CI #786](https://github.com/miphu2804/smart-ledger/actions/runs/40277351366) on the feature branch still waits for a runner. The manual run [CI #787](https://github.com/miphu2804/smart-ledger/actions/runs/40278406256) on the main branch was blocked by GitHub before a runner was assigned because the repository owner's account is locked for billing; the summary then failed in fromJSON because there was no runner output. The user does not manage the M4 Pro machine.

**Impact:** There is no passing CI for the HEAD of PR #368. Passing local tests do not replace required checks. The artifact quota blocked the summary upload in #785, but that upload is optional/continue-on-error and did not cause the two Core/container jobs to fail.

**Next action:** The repository owner fixes billing or the M4 Pro manager restores the runner/network, then run CI on `feat/admin-dashboard-growth` itself and check that the jobs actually executed. Do not drop required checks, change runner variables, delete artifacts or merge to get around the blocker.

### [2026-10-26] — [Validation] PostgreSQL regression for admin growth completed

**Status:** Resolved

**Blocked by:** Docker Desktop previously reported a process error and the CLI could not connect to the Linux engine. The user restored Docker; the rerun completed.

**Resolution:** `mvnw.cmd -B verify` on commit `976be02` in a clean temporary checkout, with its own PostgreSQL 16.15, reached BUILD SUCCESS: 1,422 tests, no failures/errors/skips. The Maven totals were checked against the XML testcases; they include 22 controller tests and 18 PostgreSQL tests for the dashboard, with a UTC DB session assertion. Local log: `backend/core/target/admin-growth-full-verify-20261026.log` (ignored). No local/staging/production business DB was used and no migration was created.

**Next action:** The branch was approved for push and published at `6381054`; PR #368 is open into staging. Handle the CI checks/review, then accept FE integration, the staging smoke/UAT and a real load evaluation; local results do not replace these steps.

### [2026-09-15 21:46 UTC+07:00] — [Planning] The dashboard issues cannot be assigned to Hiep yet

**Status:** Open

**Blocked by:** Hiep's GitHub username is unknown and Hiep is not in the repository's collaborator list.

**Impact:** #17–#19 name Hiep as the intended owner, but the GitHub assignee is empty.

**Next action:** Provide the correct GitHub username or add Hiep as a collaborator, then assign #17–#19.
