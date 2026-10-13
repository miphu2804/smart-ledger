package com.smartledger.core.dto.response;

import java.util.List;
import java.util.function.Function;
import org.springframework.data.domain.Page;

/** Stable public pagination envelope, independent of Spring's Page serialization. */
public record PageResponse<T>(List<T> items, int page, int size, long totalElements, int totalPages) {
    public PageResponse {
        items = List.copyOf(items);
    }

    public static <S, T> PageResponse<T> from(Page<S> source, Function<S, T> mapper) {
        return new PageResponse<>(source.getContent().stream().map(mapper).toList(),
                source.getNumber(), source.getSize(), source.getTotalElements(), source.getTotalPages());
    }
}
