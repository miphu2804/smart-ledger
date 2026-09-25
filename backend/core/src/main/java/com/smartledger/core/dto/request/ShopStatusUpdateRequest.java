package com.smartledger.core.dto.request;

import com.smartledger.core.enums.ShopStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ShopStatusUpdateRequest(
        @NotNull(message = "must be provided")
        ShopStatus status,
        @Size(max = 500, message = "must not exceed 500 characters")
        String inactiveReason) {
}
