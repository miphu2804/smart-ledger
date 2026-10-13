package com.smartledger.core.exception;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.smartledger.core.enums.CatalogStatus;
import io.swagger.v3.oas.annotations.media.Schema;

public record ApiErrorDetail(
        String field,
        String issue,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        @Schema(description = "Product holding the barcode in the authorized shop; present only for a detected barcode conflict.")
        Long productId,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        @Schema(description = "Status of the product holding the barcode; present only for a detected barcode conflict.")
        CatalogStatus status) {

    public ApiErrorDetail(String field, String issue) {
        this(field, issue, null, null);
    }
}
