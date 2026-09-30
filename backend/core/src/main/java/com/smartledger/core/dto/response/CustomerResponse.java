package com.smartledger.core.dto.response;

import com.smartledger.core.enums.CatalogStatus;
import java.time.OffsetDateTime;

public record CustomerResponse(
        Long id, Long shopId, String name, String phone, CatalogStatus status,
        OffsetDateTime createdAt, OffsetDateTime updatedAt) {
}
