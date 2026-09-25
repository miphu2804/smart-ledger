package com.smartledger.core.dto.response;

import com.smartledger.core.enums.CatalogStatus;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record ProductResponse(
        Long id,
        Long shopId,
        Long categoryId,
        String name,
        String barcode,
        String imageUrl,
        String unit,
        Long sellingPriceVnd,
        Long costPriceVnd,
        boolean tracked,
        BigDecimal stockQuantity,
        CatalogStatus status,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {
}
