package com.smartledger.core.media;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.MediaUploadKeyRepository;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * Creates a durable pending reservation before a remote upload. The reservation is committed in
 * its own short transaction; no database transaction is held while Cloudinary is called.
 */
@Component
public class MediaIdempotencyReplay {
    private final MediaUploadKeyRepository repository;
    private final ObjectMapper objectMapper;
    private final int ttlDays;
    private final int uploadLeaseSeconds;

    public MediaIdempotencyReplay(MediaUploadKeyRepository repository, ObjectMapper objectMapper,
            @Value("${smartledger.idempotency.ttl-days:30}") int ttlDays,
            @Value("${smartledger.media.upload-lease-seconds:300}") int uploadLeaseSeconds) {
        if (ttlDays <= 0 || uploadLeaseSeconds <= 0) {
            throw new IllegalArgumentException("Media idempotency retention and upload lease must be positive");
        }
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.ttlDays = ttlDays;
        this.uploadLeaseSeconds = uploadLeaseSeconds;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public <T> Reservation<T> reserve(Long shopId, Long userId, String operation, String key,
            MediaUploadRequest request, Class<T> responseType) {
        if (!StringUtils.hasText(key) || key.length() > 255) {
            throw new BusinessException(ErrorCode.INVALID_IDEMPOTENCY_KEY);
        }
        String normalizedKey = key.trim();
        String requestHash = hash(request);
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        OffsetDateTime pendingExpiresAt = now.plusSeconds(uploadLeaseSeconds);
        UUID leaseToken = UUID.randomUUID();
        String scope = scope(shopId, userId);
        if (repository.reserve(scope, userId, operation, normalizedKey, requestHash, request.publicId(), leaseToken, pendingExpiresAt)) {
            return new Reservation<>(normalizedKey, requestHash, null, leaseToken);
        }
        // A failed request may release its short-lived reservation between our INSERT conflict and
        // SELECT. Retry the reservation once rather than surfacing that harmless race as a 500.
        Optional<MediaUploadKeyRepository.StoredResult> existing = repository.findOptional(scope, operation,
                normalizedKey);
        if (existing.isEmpty() && repository.reserve(scope, userId, operation, normalizedKey, requestHash,
                request.publicId(), leaseToken, pendingExpiresAt)) {
            return new Reservation<>(normalizedKey, requestHash, null, leaseToken);
        }
        MediaUploadKeyRepository.StoredResult stored = existing.orElseThrow(
                () -> new BusinessException(ErrorCode.MEDIA_UPLOAD_IN_PROGRESS));
        if (!stored.userId().equals(userId) || !stored.requestHash().equals(requestHash)) {
            throw new BusinessException(ErrorCode.IDEMPOTENCY_KEY_CONFLICT);
        }
        if (stored.responseBody() == null && !stored.expiresAt().isAfter(now)) {
            if (repository.reclaim(scope, operation, normalizedKey, stored.leaseToken(), leaseToken, pendingExpiresAt)) {
                return new Reservation<>(normalizedKey, requestHash, null, leaseToken);
            }
            throw new BusinessException(ErrorCode.MEDIA_UPLOAD_IN_PROGRESS);
        }
        if (!stored.expiresAt().isAfter(now)) {
            throw new BusinessException(ErrorCode.IDEMPOTENCY_KEY_EXPIRED);
        }
        if (stored.responseBody() == null) {
            throw new BusinessException(ErrorCode.MEDIA_UPLOAD_IN_PROGRESS);
        }
        return Reservation.replay(normalizedKey, requestHash, fromJson(stored.responseBody(), responseType));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public <T> void complete(Long shopId, Long userId, String operation, Reservation<T> reservation,
            T response) {
        repository.completePending(scope(shopId, userId), operation, reservation.key(), reservation.leaseToken(), toJson(response),
                OffsetDateTime.now(ZoneOffset.UTC).plusDays(ttlDays));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void release(Long shopId, Long userId, String operation, Reservation<?> reservation) {
        repository.releasePending(scope(shopId, userId), operation, reservation.key(), reservation.leaseToken());
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void lockPending(Long shopId, Long userId, String operation, Reservation<?> reservation) {
        repository.lockPending(scope(shopId, userId), operation, reservation.key(), reservation.leaseToken());
    }

    private String scope(Long shopId, Long userId) {
        return shopId == null ? "USER:" + userId : "SHOP:" + shopId;
    }

    private String hash(MediaUploadRequest request) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(objectMapper.writeValueAsBytes(request)));
        } catch (JsonProcessingException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Cannot hash media request", exception);
        }
    }

    private <T> T fromJson(String json, Class<T> responseType) {
        try {
            return objectMapper.readValue(json, responseType);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot read media idempotency result", exception);
        }
    }

    private String toJson(Object response) {
        try {
            return objectMapper.writeValueAsString(response);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Cannot save media idempotency result", exception);
        }
    }

    public record Reservation<T>(String key, String requestHash, T replay, UUID leaseToken) {
        public static <T> Reservation<T> pending(String key, String requestHash) {
            return new Reservation<>(key, requestHash, null, UUID.randomUUID());
        }

        public static <T> Reservation<T> replay(String key, String requestHash, T response) {
            return new Reservation<>(key, requestHash, response, null);
        }

        public boolean isReplay() {
            return replay != null;
        }
    }
}
