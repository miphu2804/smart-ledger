package com.smartledger.core.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ArchiveShopRequest(
        @NotBlank(message = "must not be blank")
        @Size(max = 500, message = "must not exceed 500 characters")
        String archivedReason) {
}
