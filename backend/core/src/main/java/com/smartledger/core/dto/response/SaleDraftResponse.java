package com.smartledger.core.dto.response;

import com.smartledger.core.enums.DraftStatus;
import com.smartledger.core.enums.PaymentMethod;
import java.time.OffsetDateTime;
import java.util.List;

public record SaleDraftResponse(
        Long id, Long shopId, String customerName, String customerPhone,
        Long discountVnd, Long estimatedTotalVnd, Long initialPaidVnd,
        PaymentMethod initialPaymentMethod, DraftStatus status, OffsetDateTime expiresAt,
        Long confirmedSaleId, List<SaleDraftItemResponse> items) {
}
