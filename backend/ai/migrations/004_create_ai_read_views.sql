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
-- without accents ("gao") matches "Gạo". Upper-case letters are listed too because lower() only
-- folds ASCII under the C locale.
CREATE OR REPLACE VIEW ai_read.v_products
WITH (security_barrier = true) AS
SELECT
    p.id,
    p.name,
    lower(translate(
        p.name,
        'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ',
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
