package com.smartledger.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CustomerWriteRequest(
        @NotBlank @Size(max = 150) String name,
        @Size(max = 30) String phone) {
}
