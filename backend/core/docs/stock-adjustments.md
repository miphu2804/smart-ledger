# Independent stock decreases — CORE-021

Implementation for [#457](https://github.com/miphu2804/smart-ledger/issues/457) on `feat/core-stock-adjustment`, approved by the owner on 2026-11-02. The [API contract](../../../docs/contracts/api-contracts.md#điều-chỉnh-giảm-tồn-core-021) owns request/response/errors and the [PRD](../../../docs/product/product-requirements.md#điều-chỉnh-giảm-tồn-core-021--đã-duyệt-ngày-2026-11-02) owns `FR-038` and `AC-111`–`AC-115`. This does not establish FE, staging or production acceptance.

## Transaction and existing storage

The controller validates a positive quantity with at most 12 integer and 3 fractional digits, plus a nonblank reason of at most 500 characters. `ProductServiceImpl.adjustStock` checks the active OWNER and owned active shop, normalizes quantity/reason, and reserves the key under `PRODUCT_STOCK_ADJUSTMENT` before taking the same Product row lock used by checkout, void, PATCH and stock-in. It refreshes any managed Product, then rejects untracked products and insufficient stock instead of silently skipping or clamping the decrease.

The resulting stock, `STOCK_ADJUSTED` audit, existing LOW/OUT notification reconciliation and original `200 ProductResponse` snapshot commit in one transaction. A valid replay checks shop access and returns the original snapshot without re-running the action, even when later stock has changed. Money tables and prices are unchanged. Reason text is operator input; do not put credentials or customer information in it.

No migration, new table, environment variable or credential-map change is required. V7 idempotency, existing audit constraints and V15 notifications accept this operation/source without DDL changes. Do not modify applied migration checksums. Rollback means removing the endpoint/application implementation while retaining already committed stock changes and audit history; it does not automatically restore stock. Any business correction must be a separately authorized operation.

## Verification and FE handoff

Use only a disposable PostgreSQL database with the `CORE_TEST_POSTGRES_*` variables from the [Core README](../README.md), never a business database. Run `mvn --batch-mode --no-transfer-progress verify`, then `python scripts/verify_postgres_tests.py target/surefire-reports` to require actual PostgreSQL test execution. The HTTP contract tests cover validation/auth/headers/error envelopes; Product domain tests cover boundaries; real PostgreSQL tests cover normalized replay, changed/expired keys, permissions, money isolation, failure rollback and concurrent writers. Notification tests cover LOW-to-OUT transitions and retry deduplication.

FE must present a quantity to subtract and required free-text reason, preserve `Idempotency-Key` for retries, and start a new key for another adjustment. Keep stock-in for increases; never send an absolute stock count through PATCH. Staging acceptance must additionally exercise an owned tracked product, exact-zero/overdraw cases, a lost-response retry, audit history and the inbox through the integrated UI after merge/deploy. This change does not add a stock ledger screen, reason categories, AI writes, or production rollout.
