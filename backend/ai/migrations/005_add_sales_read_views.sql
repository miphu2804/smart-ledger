-- Sales read views for the agent's sales questions and restock suggestions. Run after Core's
-- Flyway migration V4 (which creates `sales` and `sale_items`) and after 004, with the
-- search_path that holds Core's tables (the default `public`). Safe to re-run.
--
-- Scope follows 004: every view filters on the transaction-local setting
-- `smartledger.shop_id` and exposes no `shop_id`. `sale_items` has no shop id of its own, so it
-- joins `sales` and filters there. Customer snapshots (PII) and the free-text `void_reason`,
-- which a user can write, are deliberately absent: neither should reach the model.

CREATE OR REPLACE VIEW ai_read.v_sales
WITH (security_barrier = true) AS
SELECT
    s.id,
    s.sale_status,
    s.payment_status,
    s.subtotal_vnd,
    s.discount_vnd,
    s.total_vnd,
    s.paid_vnd,
    s.sold_at,
    s.voided_at
FROM sales s
WHERE s.shop_id = NULLIF(current_setting('smartledger.shop_id', true), '')::bigint;

-- name_folded is copied verbatim from v_products so an unaccented question matches the item
-- name typed at sale time.
CREATE OR REPLACE VIEW ai_read.v_sale_items
WITH (security_barrier = true) AS
SELECT
    si.sale_id,
    si.product_id,
    si.product_name_snapshot AS product_name,
    lower(translate(
        si.product_name_snapshot,
        U&'\00E0\00E1\1EA1\1EA3\00E3\00E2\1EA7\1EA5\1EAD\1EA9\1EAB\0103\1EB1\1EAF\1EB7\1EB3\1EB5\00E8\00E9\1EB9\1EBB\1EBD\00EA\1EC1\1EBF\1EC7\1EC3\1EC5\00EC\00ED\1ECB\1EC9\0129\00F2\00F3\1ECD\1ECF\00F5\00F4\1ED3\1ED1\1ED9\1ED5\1ED7\01A1\1EDD\1EDB\1EE3\1EDF\1EE1\00F9\00FA\1EE5\1EE7\0169\01B0\1EEB\1EE9\1EF1\1EED\1EEF\1EF3\00FD\1EF5\1EF7\1EF9\0111\00C0\00C1\1EA0\1EA2\00C3\00C2\1EA6\1EA4\1EAC\1EA8\1EAA\0102\1EB0\1EAE\1EB6\1EB2\1EB4\00C8\00C9\1EB8\1EBA\1EBC\00CA\1EC0\1EBE\1EC6\1EC2\1EC4\00CC\00CD\1ECA\1EC8\0128\00D2\00D3\1ECC\1ECE\00D5\00D4\1ED2\1ED0\1ED8\1ED4\1ED6\01A0\1EDC\1EDA\1EE2\1EDE\1EE0\00D9\00DA\1EE4\1EE6\0168\01AF\1EEA\1EE8\1EF0\1EEC\1EEE\1EF2\00DD\1EF4\1EF6\1EF8\0110',
        'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydaaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
    )) AS name_folded,
    si.unit_snapshot AS unit,
    si.quantity,
    si.unit_price_vnd,
    si.line_total_vnd,
    s.sale_status,
    s.sold_at
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
WHERE s.shop_id = NULLIF(current_setting('smartledger.shop_id', true), '')::bigint;

-- A schema-wide REVOKE clears grants held through PUBLIC only; the SELECTs 004 granted to
-- ai_sql_reader survive it, so the reader keeps reaching the three earlier views. Therefore
-- this file grants the two new views only.
REVOKE ALL ON ALL TABLES IN SCHEMA ai_read FROM PUBLIC;
GRANT SELECT ON ai_read.v_sales, ai_read.v_sale_items TO ai_sql_reader;
