package com.smartledger.core.dto.request;

import jakarta.validation.constraints.Size;

public record ShopUpdateRequest(
        @Size(min = 1, max = 200, message = "must contain 1 to 200 characters")
        String name,
        @Size(min = 1, max = 100, message = "must contain 1 to 100 characters")
        String industry,
        @Size(max = 30, message = "must not exceed 30 characters")
        String phone,
        @Size(max = 500, message = "must not exceed 500 characters")
        String address) {

    public boolean hasChanges() {
        return name != null || industry != null || phone != null || address != null;
    }
}
