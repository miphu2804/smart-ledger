package com.smartledger.core.dto.response;

import java.math.BigDecimal;

public record SaleItemResponse(
        Long id, Long productId, String productName, String unit,
        BigDecimal quantity, Long unitPriceVnd, Long lineTotalVnd) {
}
