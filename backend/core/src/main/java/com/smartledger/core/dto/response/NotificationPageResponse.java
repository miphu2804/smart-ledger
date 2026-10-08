package com.smartledger.core.dto.response;

import java.util.List;

public record NotificationPageResponse(List<NotificationResponse> items, int page, int size,
        long totalElements, int totalPages) {
    public NotificationPageResponse { items = List.copyOf(items); }
}
