-- Read-only debt, payment and expense views for the agent's query_shop_data tool.
--
-- Apply after the AI baseline and after Core's Flyway migrations up to V9 (debts, payments,
-- expenses and the debt void columns). Like the baseline, each view keeps only the shop in the
-- transaction-local `smartledger.shop_id` setting, exposes no `shop_id`, and is a
-- `security_barrier` view, so a caller's WHERE clause cannot run on other shops' rows first.
--
-- Left out on purpose, so they never reach the model: customer names and phone numbers (only
-- the opaque customer_id, for counting customers), transfer references, the users who received
-- or recorded money, and the free-text expense description.
-- debts and payments have no shop_id; they are scoped through their sale.
-- Every statement is safe to re-run.

CREATE OR REPLACE VIEW ai_read.v_debts
WITH (security_barrier = true) AS
SELECT
    d.id,
    d.sale_id,
    d.customer_id,
    d.original_vnd,
    d.outstanding_vnd,
    d.cancelled_vnd,
    d.status,
    d.created_at,
    d.settled_at,
    d.voided_at
FROM debts d
JOIN sales s ON s.id = d.sale_id
WHERE s.shop_id = NULLIF(current_setting('smartledger.shop_id', true), '')::bigint;

CREATE OR REPLACE VIEW ai_read.v_payments
WITH (security_barrier = true) AS
SELECT
    p.id,
    p.sale_id,
    p.debt_id,
    p.amount_vnd,
    p.payment_method,
    p.type,
    p.received_at
FROM payments p
JOIN sales s ON s.id = p.sale_id
WHERE s.shop_id = NULLIF(current_setting('smartledger.shop_id', true), '')::bigint;

-- Archived expenses are deleted from the owner's point of view, so they are not exposed.
CREATE OR REPLACE VIEW ai_read.v_expenses
WITH (security_barrier = true) AS
SELECT
    e.id,
    e.category,
    e.amount_vnd,
    e.payment_method,
    e.expense_at
FROM expenses e
WHERE e.shop_id = NULLIF(current_setting('smartledger.shop_id', true), '')::bigint
  AND e.status = 'ACTIVE';

REVOKE ALL ON ai_read.v_debts, ai_read.v_payments, ai_read.v_expenses FROM PUBLIC;
GRANT SELECT ON ai_read.v_debts, ai_read.v_payments, ai_read.v_expenses TO ai_sql_reader;
