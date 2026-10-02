package com.smartledger.core.service;

import java.util.function.Function;
import java.util.function.Supplier;

public interface IdempotencyService {
    <T> T execute(Long shopId, Long userId, String operation, String key, Object request,
            String resourceType, Function<T, Long> resourceId, Class<T> responseType, Supplier<T> action);
}
