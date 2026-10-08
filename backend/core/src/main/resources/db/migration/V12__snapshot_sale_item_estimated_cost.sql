-- Snapshot the known catalog cost at sale confirmation. Historical and custom
-- sale items intentionally remain NULL; never backfill them from today's product price.
ALTER TABLE sale_items ADD COLUMN estimated_cost_vnd BIGINT;

ALTER TABLE sale_items ADD CONSTRAINT ck_sale_items_estimated_cost
    CHECK (estimated_cost_vnd IS NULL OR estimated_cost_vnd >= 0);
