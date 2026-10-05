-- Forward-only extension of V10's shared audit table. No history is rewritten.
-- Validation failure rolls back the whole migration; review invalid existing
-- rows instead of deleting history or bypassing constraints with Flyway repair.
-- Deploy through staging first. Recovery retains ADMIN events and uses a reviewed
-- forward fix; do not restore V10's NOT NULL/action checks after ADMIN reads exist.
SET LOCAL lock_timeout = '5s';

ALTER TABLE audit_logs
    ALTER COLUMN shop_id DROP NOT NULL,
    ALTER COLUMN entity_id DROP NOT NULL;

-- Hibernate-created local databases may retain an obsolete enum whitelist.
-- The action/target check below supplies the complete whitelist for both roles.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS ck_audit_logs_ids;
ALTER TABLE audit_logs ADD CONSTRAINT ck_audit_logs_ids CHECK (
    id > 0 AND actor_user_id > 0
    AND (shop_id IS NULL OR shop_id > 0)
    AND (entity_id IS NULL OR entity_id > 0)
);

ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS ck_audit_logs_action_target;
ALTER TABLE audit_logs ADD CONSTRAINT ck_audit_logs_action_target CHECK (
    -- Existing business events always require a real shop and target.
    (shop_id IS NOT NULL AND entity_id IS NOT NULL AND (
        (entity_type = 'SALE' AND action IN ('SALE_CONFIRMED', 'SALE_VOIDED'))
        OR (entity_type = 'SALE_REFUND' AND action = 'SALE_REFUND_RECORDED')
        OR (entity_type = 'DEBT' AND action IN ('DEBT_REPAYMENT_RECORDED', 'DEBT_VOIDED'))
        OR (entity_type = 'PRODUCT' AND action IN ('STOCK_ADJUSTED', 'STOCK_RESTORED_ON_VOID',
            'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_ARCHIVED'))
        OR (entity_type = 'EXPENSE' AND action IN ('EXPENSE_CREATED', 'EXPENSE_UPDATED', 'EXPENSE_ARCHIVED'))
        OR (entity_type = 'CATEGORY' AND action IN ('CATEGORY_CREATED', 'CATEGORY_UPDATED', 'CATEGORY_ARCHIVED'))
        OR (entity_type = 'SHOP' AND action IN ('SHOP_CREATED', 'SHOP_UPDATED', 'SHOP_ARCHIVED',
            'SHOP_INACTIVATED', 'SHOP_REACTIVATED'))
    ))
    OR (actor_role = 'ADMIN' AND reason IS NULL AND idempotency_key IS NULL AND (
        (action IN ('ADMIN_SHOP_VIEWED', 'ADMIN_SHOP_STATUS_HISTORY_VIEWED')
            AND entity_type = 'SHOP' AND shop_id IS NOT NULL AND entity_id IS NOT NULL AND entity_id = shop_id)
        OR (action = 'ADMIN_OWNER_VIEWED' AND entity_type = 'OWNER' AND shop_id IS NULL AND entity_id IS NOT NULL)
        OR (action = 'ADMIN_OVERVIEW_VIEWED' AND entity_type = 'SYSTEM' AND shop_id IS NULL AND entity_id IS NULL)
        OR (action = 'ADMIN_OWNERS_SEARCHED' AND entity_type = 'OWNER_LIST' AND shop_id IS NULL AND entity_id IS NULL)
        OR (action = 'ADMIN_SHOPS_SEARCHED' AND entity_type = 'SHOP_LIST' AND shop_id IS NULL AND entity_id IS NULL)
        OR (action = 'ADMIN_ACCESS_LOGS_VIEWED' AND entity_type = 'ADMIN_ACCESS_LOG_LIST' AND shop_id IS NULL AND entity_id IS NULL)
    ))
);

-- V10's role/outcome/request/metadata checks, FKs, indexes and append-only
-- triggers remain in place. Never create a separate admin_access_logs table.
