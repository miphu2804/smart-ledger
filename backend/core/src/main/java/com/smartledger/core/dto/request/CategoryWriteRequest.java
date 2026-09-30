package com.smartledger.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CategoryWriteRequest(
        @NotBlank(message = "must not be blank")
        @Size(max = 150, message = "must not exceed 150 characters")
        String name) {
}
