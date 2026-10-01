package com.smartledger.core.dto.response;

import com.smartledger.core.enums.CatalogStatus;
import java.time.OffsetDateTime;

public record CategoryResponse(
        Long id,
        Long shopId,
        String name,
        CatalogStatus status,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {
}
