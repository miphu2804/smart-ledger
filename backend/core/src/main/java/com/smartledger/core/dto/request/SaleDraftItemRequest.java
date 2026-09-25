package com.smartledger.core.dto.request;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import java.math.BigDecimal;

public record SaleDraftItemRequest(
        @NotNull @Positive Long productId,
        @NotNull @Positive @Digits(integer = 12, fraction = 3) BigDecimal quantity,
        @NotNull @PositiveOrZero Long unitPriceVnd) {
}
