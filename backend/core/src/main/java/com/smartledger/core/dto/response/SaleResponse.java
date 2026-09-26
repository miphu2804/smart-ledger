package com.smartledger.core.dto.response;

import com.smartledger.core.enums.PaymentStatus;
import com.smartledger.core.enums.SaleStatus;
import java.time.OffsetDateTime;
import java.util.List;

public record SaleResponse(
        Long id, Long shopId, String customerName, String customerPhone,
        Long subtotalVnd, Long discountVnd, Long totalVnd, Long paidVnd,
        SaleStatus saleStatus, PaymentStatus paymentStatus, OffsetDateTime soldAt,
        List<SaleItemResponse> items) {
}
