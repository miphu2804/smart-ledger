-- CORE-012 D1b: archive releases a barcode without rewriting product/history rows.
-- Run in a controlled maintenance window with catalog writes paused. This is an
-- ordinary transactional index build, NOT a concurrent/zero-downtime migration.
-- Create the new guard before removing the old one; any failure rolls back V16.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE UNIQUE INDEX uq_products_shop_barcode_active
    ON products (shop_id, barcode)
    WHERE status = 'ACTIVE' AND barcode IS NOT NULL;

ALTER TABLE products DROP CONSTRAINT IF EXISTS uq_products_shop_barcode;

-- Recovery: keep this index and deploy a compatible application. Restoring the
-- old constraint needs a reviewed forward migration and an explicit decision on
-- duplicates across ACTIVE/ARCHIVED rows; never delete/recode history silently.
