-- OWNER-approved cancellation schema. Apply before deploying the cancellation writer.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE billing_payment_requests
    ADD COLUMN cancelled_at TIMESTAMPTZ,
    DROP CONSTRAINT billing_payment_requests_status_check,
    ADD CONSTRAINT billing_payment_requests_status_check
        CHECK (status IN ('PENDING', 'EXPIRED', 'PAID', 'CANCELLED')),
    ADD CONSTRAINT ck_billing_request_cancelled CHECK (
        (status = 'CANCELLED') = (cancelled_at IS NOT NULL)
        AND (cancelled_at IS NULL OR (cancelled_at >= created_at AND cancelled_at < expires_at)));

ALTER TABLE billing_bank_transactions
    DROP CONSTRAINT billing_bank_transactions_reason_check,
    ADD CONSTRAINT billing_bank_transactions_reason_check
        CHECK (reason IN ('MATCHED', 'LATE_RECEIPT', 'AMOUNT_MISMATCH', 'RECIPIENT_MISMATCH',
            'MISSING_CODE', 'UNKNOWN_CODE', 'AMBIGUOUS_CODE', 'EXTRA_TRANSFER', 'OUTGOING', 'CANCELLED_REQUEST'));
