package com.smartledger.core.dto.request;

import com.smartledger.core.enums.PaymentMethod;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;

public record ExpenseWriteRequest(
        @Size(max = 150) String category,
        @NotBlank @Size(max = 500) String description,
        @NotNull @Positive Long amountVnd,
        PaymentMethod paymentMethod,
        OffsetDateTime expenseAt) {
}
