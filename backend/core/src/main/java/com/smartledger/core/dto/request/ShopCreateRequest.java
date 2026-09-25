package com.smartledger.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ShopCreateRequest(
        @NotBlank(message = "must not be blank")
        @Size(max = 200, message = "must not exceed 200 characters")
        String name,
        @NotBlank(message = "must not be blank")
        @Size(max = 100, message = "must not exceed 100 characters")
        String industry,
        @Size(max = 30, message = "must not exceed 30 characters")
        String phone,
        @Size(max = 500, message = "must not exceed 500 characters")
        String address) {
}
