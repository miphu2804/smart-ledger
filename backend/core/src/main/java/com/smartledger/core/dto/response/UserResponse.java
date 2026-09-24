package com.smartledger.core.dto.response;

public record UserResponse(
        Long id,
        String displayName,
        String email,
        String phone,
        String avatarUrl) {
}
