package com.smartledger.core.dto.response;

import java.util.List;

public record AdminPageResponse<T>(List<T> items, int page, int size, long totalElements, int totalPages) {
    public AdminPageResponse { items = List.copyOf(items); }

    public static <T> AdminPageResponse<T> of(List<T> items, int page, int size, long total) {
        return new AdminPageResponse<>(items, page, size, total, (int) Math.min(Integer.MAX_VALUE, (total + size - 1) / size));
    }
}
