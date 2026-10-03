package com.smartledger.core.dto.response;

public record SaleVoidResponse(SaleResponse sale, SaleRefundResponse refund,
        Long cancelledDebtVnd, boolean stockRestocked) {
}
