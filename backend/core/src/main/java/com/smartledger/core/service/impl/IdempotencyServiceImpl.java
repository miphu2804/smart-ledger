package com.smartledger.core.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.datatype.jsr310.ser.OffsetDateTimeSerializer;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.IdempotencyKeyRepository;
import com.smartledger.core.repository.IdempotencyKeyRepository.StoredResult;
import com.smartledger.core.service.IdempotencyService;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.function.Function;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class IdempotencyServiceImpl implements IdempotencyService {
    private final IdempotencyKeyRepository repository;
    private final ObjectMapper objectMapper;
    private final ObjectMapper requestHashMapper;
    private final int ttlDays;

    public IdempotencyServiceImpl(IdempotencyKeyRepository repository, ObjectMapper objectMapper,
            @Value("${smartledger.idempotency.ttl-days:30}") int ttlDays) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        // Display formatting must not change hashes already stored for expense retries.
        SimpleModule hashTimeModule = new SimpleModule("IdempotencyRequestHashTime");
        hashTimeModule.addSerializer(OffsetDateTime.class, OffsetDateTimeSerializer.INSTANCE);
        this.requestHashMapper = objectMapper.copy().registerModule(hashTimeModule);
        if (ttlDays < 1) {
            throw new IllegalArgumentException("Idempotency retention must be at least one day");
        }
        this.ttlDays = ttlDays;
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public <T> T execute(Long shopId, Long userId, String operation, String key, Object request,
            String resourceType, Function<T, Long> resourceId, Class<T> responseType, Supplier<T> action) {
        if (!StringUtils.hasText(key) || key.length() > 255) {
            throw new BusinessException(ErrorCode.INVALID_IDEMPOTENCY_KEY);
        }
        String normalizedKey = key.trim();
        String requestHash = sha256(request);
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);

        // The unique index makes a concurrent retry wait for the first transaction to commit or roll back.
        if (!repository.reserve(shopId, userId, operation, normalizedKey, requestHash, now.plusDays(ttlDays))) {
            StoredResult stored = repository.find(shopId, operation, normalizedKey);
            if (!stored.userId().equals(userId) || !stored.requestHash().equals(requestHash)) {
                throw new BusinessException(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
            }
            if (!stored.expiresAt().isAfter(now)) {
                throw new BusinessException(ErrorCode.IDEMPOTENCY_KEY_EXPIRED);
            }
            if (stored.responseBody() == null) {
                throw new IllegalStateException("Committed idempotency result is incomplete");
            }
            return fromJson(stored.responseBody(), responseType);
        }

        T response = action.get();
        repository.complete(shopId, operation, normalizedKey, resourceType,
                resourceId.apply(response), 201, toJson(response));
        return response;
    }

    private String sha256(Object request) {
        try {
            byte[] bytes = requestHashMapper.writeValueAsBytes(request);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (JsonProcessingException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Cannot hash idempotent request", exception);
        }
    }

    private String toJson(Object response) {
        try {
            return objectMapper.writeValueAsString(response);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot save idempotent response", exception);
        }
    }

    private <T> T fromJson(String json, Class<T> responseType) {
        try {
            return objectMapper.readValue(json, responseType);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot read idempotent response", exception);
        }
    }
}
