-- A made-up grocery shop for the agent evaluation; local database only.
-- Rerun it any time: it replaces shop 9001 and dates its sales relative to today.
-- Every day has sales at 00:30 and 23:30 shop time, so a window cut in UTC instead of
-- the shop's time zone moves a sale across a day or month and changes the answer.
BEGIN;

DELETE FROM agent_memories WHERE shop_id = 9001;
DELETE FROM chat_messages WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE shop_id = 9001);
DELETE FROM chat_conversations WHERE shop_id = 9001;
DELETE FROM payments WHERE sale_id IN (SELECT id FROM sales WHERE shop_id = 9001);
DELETE FROM debts WHERE sale_id IN (SELECT id FROM sales WHERE shop_id = 9001);
DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE shop_id = 9001);
DELETE FROM sales WHERE shop_id = 9001;
DELETE FROM expenses WHERE shop_id = 9001;
DELETE FROM products WHERE shop_id = 9001;
DELETE FROM categories WHERE shop_id = 9001;
DELETE FROM customers WHERE shop_id = 9001;
DELETE FROM shops WHERE id = 9001;

INSERT INTO shops (id, owner_id, name, industry)
SELECT 9001, min(id), 'Tạp hóa Eval', 'Tạp hóa' FROM users;

INSERT INTO categories (id, shop_id, name)
VALUES (900101, 9001, 'Thực phẩm'), (900102, 9001, 'Đồ uống'), (900103, 9001, 'Gia dụng');

INSERT INTO products (id, shop_id, category_id, name, unit, selling_price_vnd, cost_price_vnd, tracked, stock_quantity, low_stock_threshold)
VALUES
    (900101, 9001, 900101, 'Mì Hảo Hảo', 'gói', 5000, 3800, true, 240, 50),
    (900102, 9001, 900101, 'Nước mắm Nam Ngư', 'chai', 32000, 25000, true, 18, 10),
    (900103, 9001, 900101, 'Gạo ST25 5kg', 'túi', 180000, 150000, true, 3, 5),
    (900104, 9001, 900101, 'Dầu ăn Neptune 1L', 'chai', 58000, 49000, true, 22, 10),
    (900105, 9001, 900102, 'Sữa Vinamilk 1L', 'hộp', 36000, 30000, true, 7, 12),
    (900106, 9001, 900101, 'Trứng gà', 'vỉ', 34000, 28000, true, 40, 10),
    (900107, 9001, 900102, 'Coca-Cola lon', 'lon', 11000, 8000, true, 150, 48),
    (900108, 9001, 900103, 'Bột giặt OMO 3kg', 'túi', 145000, 120000, true, 12, 5);

-- No longer sold, so a count of the products on sale must leave it out.
INSERT INTO products (id, shop_id, category_id, name, unit, selling_price_vnd, cost_price_vnd, tracked, stock_quantity, low_stock_threshold, status, archived_at, archived_by_user_id)
SELECT 900109, 9001, 900102, 'Trà xanh C2', 'chai', 9000, 6500, true, 0, 10, 'ARCHIVED', now() - interval '90 days', owner_id
FROM shops WHERE id = 9001;

INSERT INTO customers (id, shop_id, name, normalized_phone)
VALUES
    (900101, 9001, 'Chị Lan', '0900000001'),
    (900102, 9001, 'Anh Hùng', '0900000002'),
    (900103, 9001, 'Cô Mai', '0900000003'),
    (900104, 9001, 'Chú Tâm', '0900000004');

-- Modular arithmetic instead of random(), so every rerun builds the same shop.
DO $$
DECLARE
    owner bigint := (SELECT owner_id FROM shops WHERE id = 9001);
    shop_today timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh';
    popular int[] := ARRAY[1, 1, 1, 7, 7, 2, 3, 4, 5, 6, 8];
    slots interval[] := ARRAY[interval '30 minutes', interval '10 hours', interval '16 hours', interval '23 hours 30 minutes'];
    n int := 0;
    day_ago int;
    slot int;
    sold timestamptz;
    product record;
    quantity int;
    subtotal bigint;
    discount bigint;
    total bigint;
    paid bigint;
    customer bigint;
    payment text;
    new_sale bigint;
    new_debt bigint;
    repaid bigint;
    rent_at timestamptz;
BEGIN
    -- 95 days always covers the two whole months before this one.
    FOR day_ago IN 0..95 LOOP
        FOR slot IN 1..4 LOOP
            sold := shop_today - make_interval(days => day_ago) + slots[slot];
            -- Today keeps only the sales already made.
            CONTINUE WHEN sold > now();
            n := n + 1;
            SELECT * INTO product FROM products WHERE id = 900100 + popular[1 + (n * 7) % 11];
            quantity := 1 + n % 5;
            subtotal := product.selling_price_vnd * quantity;
            -- Every fifth sale gets 10% off, so revenue is total_vnd and not the subtotal.
            discount := CASE WHEN n % 5 = 0 THEN subtotal / 10000 * 1000 ELSE 0 END;
            total := subtotal - discount;
            customer := 900101 + n % 4;
            IF n % 9 = 0 THEN
                paid := 0;
                payment := 'DEBT';
            ELSIF n % 13 = 0 THEN
                paid := total / 2;
                payment := 'PARTIAL';
            ELSE
                paid := total;
                payment := 'PAID';
                customer := NULL;
            END IF;

            INSERT INTO sales (shop_id, created_by_user_id, customer_id, subtotal_vnd, discount_vnd, total_vnd, paid_vnd, payment_status, sold_at)
            VALUES (9001, owner, customer, subtotal, discount, total, paid, payment, sold)
            RETURNING id INTO new_sale;
            INSERT INTO sale_items (sale_id, product_id, product_name_snapshot, unit_snapshot, quantity, unit_price_vnd, line_total_vnd, stock_deducted, estimated_cost_vnd)
            VALUES (new_sale, product.id, product.name, product.unit, quantity, product.selling_price_vnd, subtotal, true, product.cost_price_vnd * quantity);
            IF paid > 0 THEN
                INSERT INTO payments (sale_id, amount_vnd, payment_method, type, received_by_user_id, received_at)
                VALUES (new_sale, paid, 'CASH', 'INITIAL', owner, sold);
            END IF;
            IF paid < total THEN
                INSERT INTO debts (sale_id, customer_id, original_vnd, outstanding_vnd, created_at)
                VALUES (new_sale, customer, total - paid, total - paid, sold)
                RETURNING id INTO new_debt;
                -- A repayment lowers the debt but not the sale's paid_vnd, as in Core, so
                -- what is owed comes from debts and not from total minus paid.
                IF n % 4 <> 3 THEN
                    repaid := CASE WHEN n % 4 = 0 THEN total - paid ELSE (total - paid) / 2 END;
                    INSERT INTO payments (sale_id, debt_id, amount_vnd, payment_method, type, received_by_user_id, received_at)
                    VALUES (new_sale, new_debt, repaid, 'CASH', 'DEBT_REPAYMENT', owner, least(sold + interval '2 days', now()));
                    UPDATE debts
                    SET outstanding_vnd = outstanding_vnd - repaid,
                        status = CASE WHEN outstanding_vnd = repaid THEN 'SETTLED' ELSE 'OPEN' END,
                        settled_at = CASE WHEN outstanding_vnd = repaid THEN least(sold + interval '2 days', now()) END
                    WHERE id = new_debt;
                END IF;
            END IF;
            -- A voided sale must not count towards revenue, so it tests the agent's filter.
            IF n % 7 = 0 AND payment = 'PAID' THEN
                UPDATE sales
                SET sale_status = 'VOIDED', voided_at = sold, voided_by_user_id = owner, void_reason = 'Nhập nhầm'
                WHERE id = new_sale;
            END IF;
        END LOOP;
        IF day_ago % 7 = 0 AND day_ago > 0 THEN
            INSERT INTO expenses (shop_id, created_by_user_id, category, description, amount_vnd, payment_method, expense_at)
            VALUES (9001, owner, 'Nhập hàng', 'Nhập hàng tuần', 1500000, 'TRANSFER', shop_today - make_interval(days => day_ago) + interval '8 hours');
        END IF;
    END LOOP;
    -- Rent is paid at 00:30 on the 1st, the first minutes of the month in shop time.
    FOR month_ago IN 0..3 LOOP
        rent_at := (date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') - make_interval(months => month_ago) + interval '30 minutes') AT TIME ZONE 'Asia/Ho_Chi_Minh';
        CONTINUE WHEN rent_at > now();
        INSERT INTO expenses (shop_id, created_by_user_id, category, description, amount_vnd, payment_method, expense_at)
        VALUES (9001, owner, 'Thuê mặt bằng', 'Tiền thuê tháng', 4000000, 'TRANSFER', rent_at);
    END LOOP;
END $$;

COMMIT;
