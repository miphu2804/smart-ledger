package com.smartledger.core.dto.response;

import com.smartledger.core.enums.ExpenseStatus;
import com.smartledger.core.enums.PaymentMethod;
import java.time.OffsetDateTime;

public record ExpenseResponse(Long id, Long shopId, String category, String description,
        Long amountVnd, PaymentMethod paymentMethod, OffsetDateTime expenseAt,
        ExpenseStatus status, OffsetDateTime createdAt, OffsetDateTime updatedAt) {
}
