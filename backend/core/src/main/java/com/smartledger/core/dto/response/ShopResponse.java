package com.smartledger.core.dto.response;

import com.smartledger.core.entity.ShopStatus;

public record ShopResponse(
        Long id,
        String name,
        String industry,
        String phone,
        String address,
        ShopStatus status) {
}
