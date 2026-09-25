package com.smartledger.core.dto.response;

import com.smartledger.core.enums.ShopStatus;

public record ShopResponse(
        Long id,
        String name,
        String industry,
        String phone,
        String address,
        ShopStatus status,
        String inactiveReason,
        String archivedReason) {
}
