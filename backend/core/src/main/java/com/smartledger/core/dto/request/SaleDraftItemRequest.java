package com.smartledger.core.dto.request;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public record SaleDraftItemRequest(
        @Positive Long productId,
        @NotNull @Positive @Digits(integer = 12, fraction = 3) BigDecimal quantity,
        @NotNull @PositiveOrZero Long unitPriceVnd,
        @Size(max = 255) String productName,
        @Size(max = 50) String unit) {

    public SaleDraftItemRequest(Long productId, BigDecimal quantity, Long unitPriceVnd) {
        this(productId, quantity, unitPriceVnd, null, null);
    }
}
