package com.smartledger.core.dto.request;

import com.smartledger.core.enums.PaymentMethod;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SaleVoidRequest(@NotBlank @Size(max = 500) String reason,
        @NotNull(message = "Choose whether returned items should be restocked.") Boolean restockItems,
        PaymentMethod refundMethod,
        @Size(max = 255) String transferReference) {
}
