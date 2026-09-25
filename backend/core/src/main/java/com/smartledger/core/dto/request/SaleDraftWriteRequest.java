package com.smartledger.core.dto.request;

import com.smartledger.core.enums.PaymentMethod;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.List;

public record SaleDraftWriteRequest(
        @Size(max = 150) String customerName,
        @Size(max = 30) String customerPhone,
        @PositiveOrZero Long discountVnd,
        @PositiveOrZero Long initialPaidVnd,
        PaymentMethod initialPaymentMethod,
        @NotEmpty @Size(max = 100) List<@NotNull @Valid SaleDraftItemRequest> items) {
}
