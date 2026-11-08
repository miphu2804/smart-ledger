package com.smartledger.core.billing;

import java.time.OffsetDateTime;

/** Owned public projection; excludes provider transaction and sender information. */
public record BillingPaymentResponse(long id, String planCode, int planVersion, long amountVnd, String currency,
        int durationMonths, int quotaPolicyVersion, String paymentCode, String status, boolean reviewRequired,
        String fulfillmentStatus, OffsetDateTime createdAt, OffsetDateTime expiresAt, OffsetDateTime paidAt,
        Recipient recipient, String qrUrl) {
    public record Recipient(String bankCode, String accountNumber, String accountName) {}

    BillingPaymentResponse current(String state, boolean review, String fulfillment, OffsetDateTime paid) {
        return new BillingPaymentResponse(id, planCode, planVersion, amountVnd, currency, durationMonths,
                quotaPolicyVersion, paymentCode, state, review, fulfillment, createdAt, expiresAt, paid,
                recipient, "PENDING".equals(state) ? qrUrl : null);
    }
}
