package com.smartledger.core.dto.response;

import com.smartledger.core.enums.ShopStatus;

public record ShopResponse(
        Long id,
        String name,
        String industry,
        String phone,
        String address,
        String logoUrl,
        ShopStatus status,
        String inactiveReason,
        String archivedReason) {
}
