package com.smartledger.core.dto.request;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

/** A positive quantity to remove from stock; never an absolute stock count. */
public record ProductStockAdjustmentRequest(
        @NotNull @Positive @Digits(integer = 12, fraction = 3) BigDecimal quantity,
        @NotBlank @Size(max = 500) String reason) {
}
