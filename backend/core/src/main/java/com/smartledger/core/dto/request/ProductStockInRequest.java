package com.smartledger.core.dto.request;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public record ProductStockInRequest(
        @NotNull @Positive @Digits(integer = 12, fraction = 3) BigDecimal quantity,
        @Size(max = 500) String reason) {
}
