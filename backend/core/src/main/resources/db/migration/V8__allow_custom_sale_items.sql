

-- A confirmed sale can retain a custom item without a catalog product.
-- Existing product references and the foreign key remain unchanged.
ALTER TABLE sale_items ALTER COLUMN product_id DROP NOT NULL;
