package com.smartledger.core.dto.response;

import com.smartledger.core.enums.PaymentMethod;
import com.smartledger.core.enums.PaymentType;
import java.time.OffsetDateTime;

public record PaymentResponse(
        Long id, Long saleId, Long amountVnd, PaymentMethod paymentMethod,
        PaymentType type, OffsetDateTime receivedAt) {
}
