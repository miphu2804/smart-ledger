package com.smartledger.core.dto.request;

import com.smartledger.core.enums.PaymentMethod;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record DebtRepaymentRequest(
        @NotNull @Positive Long amountVnd,
        @NotNull PaymentMethod paymentMethod,
        @Size(max = 255) String transferReference) {
}
