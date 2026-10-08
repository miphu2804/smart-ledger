package com.smartledger.core.dto.response;

import com.smartledger.core.enums.PaymentMethod;
import java.time.OffsetDateTime;

public record SaleRefundResponse(Long id, Long saleId, Long amountVnd,
        PaymentMethod refundMethod, String transferReference,
        Long refundedByUserId, OffsetDateTime refundedAt) {
}
