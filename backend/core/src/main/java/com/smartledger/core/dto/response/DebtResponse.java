package com.smartledger.core.dto.response;

import com.smartledger.core.enums.DebtStatus;
import java.time.OffsetDateTime;

public record DebtResponse(
        Long id, Long saleId, Long customerId, Long originalVnd, Long outstandingVnd,
        DebtStatus status, OffsetDateTime createdAt, OffsetDateTime settledAt) {
}
