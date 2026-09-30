package com.smartledger.core.dto.request;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public record ProductWriteRequest(
        @Positive(message = "must be positive")
        Long categoryId,
        @NotBlank(message = "must not be blank")
        @Size(max = 255, message = "must not exceed 255 characters")
        String name,
        @Size(max = 100, message = "must not exceed 100 characters")
        String barcode,
        @Size(max = 1000, message = "must not exceed 1000 characters")
        String imageUrl,
        @NotBlank(message = "must not be blank")
        @Size(max = 50, message = "must not exceed 50 characters")
        String unit,
        @NotNull(message = "must be provided")
        @PositiveOrZero(message = "must not be negative")
        Long sellingPriceVnd,
        @PositiveOrZero(message = "must not be negative")
        Long costPriceVnd,
        @NotNull(message = "must be provided")
        Boolean tracked,
        @PositiveOrZero(message = "must not be negative")
        @Digits(integer = 12, fraction = 3, message = "must fit NUMERIC(15,3)")
        BigDecimal stockQuantity) {
}
