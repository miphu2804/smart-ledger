-- Read-only views for the agent's query_shop_data tool. Run after Core's Flyway migrations
-- (V1-V4 create shops, categories and products) and after 001/003, with the search_path that
-- holds Core's tables (the default `public`). The migration user needs CREATEROLE the first time,
-- to create the ai_sql_reader group role. Safe to re-run.
--
-- Scope: every view filters on the transaction-local setting `smartledger.shop_id`, which the AI
-- service sets from the authenticated request, and none of them exposes `shop_id`. An unset or
-- empty setting yields NULL, so the views return no rows. `security_barrier` stops a caller's
-- WHERE clause from being evaluated, and raising errors, on other shops' rows before the shop filter.

CREATE SCHEMA IF NOT EXISTS ai_read;

DO $$
BEGIN
    CREATE ROLE ai_sql_reader NOLOGIN;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE OR REPLACE VIEW ai_read.v_shop_profile
WITH (security_barrier = true) AS
SELECT
    s.name,
    s.industry,
    s.phone,
    s.address,
    s.status,
    s.created_at
FROM shops s
WHERE s.id = NULLIF(current_setting('smartledger.shop_id', true), '')::bigint;

CREATE OR REPLACE VIEW ai_read.v_categories
WITH (security_barrier = true) AS
SELECT
    c.id,
    c.name,
    c.status
FROM categories c
WHERE c.shop_id = NULLIF(current_setting('smartledger.shop_id', true), '')::bigint;

-- name_folded strips Vietnamese diacritics without the unaccent extension, so a question typed
-- without accents matches the accented name. Upper-case letters are listed too because lower() only
-- folds ASCII under the C locale.
CREATE OR REPLACE VIEW ai_read.v_products
WITH (security_barrier = true) AS
SELECT
    p.id,
    p.name,
    lower(translate(
        p.name,
        U&'\00E0\00E1\1EA1\1EA3\00E3\00E2\1EA7\1EA5\1EAD\1EA9\1EAB\0103\1EB1\1EAF\1EB7\1EB3\1EB5\00E8\00E9\1EB9\1EBB\1EBD\00EA\1EC1\1EBF\1EC7\1EC3\1EC5\00EC\00ED\1ECB\1EC9\0129\00F2\00F3\1ECD\1ECF\00F5\00F4\1ED3\1ED1\1ED9\1ED5\1ED7\01A1\1EDD\1EDB\1EE3\1EDF\1EE1\00F9\00FA\1EE5\1EE7\0169\01B0\1EEB\1EE9\1EF1\1EED\1EEF\1EF3\00FD\1EF5\1EF7\1EF9\0111\00C0\00C1\1EA0\1EA2\00C3\00C2\1EA6\1EA4\1EAC\1EA8\1EAA\0102\1EB0\1EAE\1EB6\1EB2\1EB4\00C8\00C9\1EB8\1EBA\1EBC\00CA\1EC0\1EBE\1EC6\1EC2\1EC4\00CC\00CD\1ECA\1EC8\0128\00D2\00D3\1ECC\1ECE\00D5\00D4\1ED2\1ED0\1ED8\1ED4\1ED6\01A0\1EDC\1EDA\1EE2\1EDE\1EE0\00D9\00DA\1EE4\1EE6\0168\01AF\1EEA\1EE8\1EF0\1EEC\1EEE\1EF2\00DD\1EF4\1EF6\1EF8\0110',
        'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydaaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
    )) AS name_folded,
    p.category_id,
    c.name AS category_name,
    p.unit,
    p.selling_price_vnd,
    p.cost_price_vnd,
    p.tracked,
    p.stock_quantity,
    p.barcode,
    p.status,
    p.updated_at
FROM products p
LEFT JOIN categories c
    ON c.id = p.category_id
   AND c.shop_id = p.shop_id
WHERE p.shop_id = NULLIF(current_setting('smartledger.shop_id', true), '')::bigint;

-- The reader sees only these views. Views run with their owner's rights, so it needs no grant
-- on the base tables, and it gets none.
REVOKE ALL ON SCHEMA public FROM ai_sql_reader;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ai_sql_reader;
REVOKE ALL ON SCHEMA ai_read FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA ai_read FROM PUBLIC;
GRANT USAGE ON SCHEMA ai_read TO ai_sql_reader;
GRANT SELECT ON ai_read.v_shop_profile, ai_read.v_categories, ai_read.v_products
    TO ai_sql_reader;
