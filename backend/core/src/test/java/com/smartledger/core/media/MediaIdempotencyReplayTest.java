package com.smartledger.core.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.IdempotencyKeyRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.math.BigDecimal;
import java.util.HexFormat;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class MediaIdempotencyReplayTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final IdempotencyKeyRepository repository = Mockito.mock(IdempotencyKeyRepository.class);
    private final MediaIdempotencyReplay replay = new MediaIdempotencyReplay(repository, mapper, 30, 300);

    @Test
    void returnsACompletedReservationBeforeCloudinaryCanBeCalledWhenTheKeyAndPayloadMatch() throws Exception {
        MediaUploadRequest request = new MediaUploadRequest("shops/7/products/9/hash", "a".repeat(64));
        ProductResponse response = mapper.readValue("""
                {"id":9,"shopId":7,"name":"Mì","unit":"gói","sellingPriceVnd":10000,
                 "tracked":false,"status":"ACTIVE"}
                """, ProductResponse.class);
        when(repository.reserve(any(), any(), any(), any(), any(), any())).thenReturn(false);
        when(repository.findOptional(any(), any(), any())).thenReturn(Optional.of(new IdempotencyKeyRepository.StoredResult(
                1L, hash(request), mapper.writeValueAsString(response), OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(5))));

        assertThat(replay.reserve(7L, 1L, "PRODUCT_IMAGE_UPLOAD", "request-key", request, ProductResponse.class)
                .replay()).isEqualTo(response);
    }

    @Test
    void rejectsAConflictingPayloadBeforeTheRemoteUpload() {
        MediaUploadRequest request = new MediaUploadRequest("shops/7/products/9/new", "b".repeat(64));
        when(repository.reserve(any(), any(), any(), any(), any(), any())).thenReturn(false);
        when(repository.findOptional(any(), any(), any())).thenReturn(Optional.of(new IdempotencyKeyRepository.StoredResult(
                1L, "another-hash", "{}", OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(5))));

        assertThatThrownBy(() -> replay.reserve(7L, 1L, "PRODUCT_IMAGE_UPLOAD", "request-key", request,
                ProductResponse.class)).isInstanceOfSatisfying(BusinessException.class,
                        ex -> assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.IDEMPOTENCY_KEY_CONFLICT));
    }

    @Test
    void rejectsASecondConcurrentRequestWhileTheFirstReservationIsPending() {
        MediaUploadRequest request = new MediaUploadRequest("shops/7/products/9/new", "b".repeat(64));
        when(repository.reserve(any(), any(), any(), any(), any(), any())).thenReturn(false);
        when(repository.findOptional(any(), any(), any())).thenReturn(Optional.of(new IdempotencyKeyRepository.StoredResult(
                1L, hashUnchecked(request), null, OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(5))));

        assertThatThrownBy(() -> replay.reserve(7L, 1L, "PRODUCT_IMAGE_UPLOAD", "request-key", request,
                ProductResponse.class)).isInstanceOfSatisfying(BusinessException.class,
                        ex -> assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.MEDIA_UPLOAD_IN_PROGRESS));
    }

    @Test
    void completesOnlyThePendingReservationOwnedByTheSameRequest() {
        ProductResponse response = new ProductResponse(9L, 7L, null, "Mì", null, null, "gói", 10000L,
                null, false, BigDecimal.ZERO, com.smartledger.core.enums.CatalogStatus.ACTIVE, null, null);
        MediaIdempotencyReplay.Reservation<ProductResponse> reservation =
                MediaIdempotencyReplay.Reservation.pending("request-key", "request-hash");

        replay.complete(7L, 1L, "PRODUCT_IMAGE_UPLOAD", reservation, "PRODUCT", ProductResponse::id, 200, response);

        verify(repository).completePending(eq(7L), eq(1L), eq("PRODUCT_IMAGE_UPLOAD"), eq("request-key"),
                eq("request-hash"), eq("PRODUCT"), eq(9L), eq(200), any(), any());
    }

    @Test
    void reclaimsAnExpiredPendingReservationForTheSameUserAndFile() {
        MediaUploadRequest request = new MediaUploadRequest("shops/7/products/9/new", "b".repeat(64));
        when(repository.reserve(any(), any(), any(), any(), any(), any())).thenReturn(false, true);
        when(repository.findOptional(any(), any(), any())).thenReturn(Optional.of(new IdempotencyKeyRepository.StoredResult(
                1L, hashUnchecked(request), null, OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(1))));

        assertThat(replay.reserve(7L, 1L, "PRODUCT_IMAGE_UPLOAD", "request-key", request, ProductResponse.class)
                .isReplay()).isFalse();
        verify(repository).releasePending(7L, 1L, "PRODUCT_IMAGE_UPLOAD", "request-key", hashUnchecked(request));
    }

    private String hash(MediaUploadRequest request) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(mapper.writeValueAsBytes(request)));
    }

    private String hashUnchecked(MediaUploadRequest request) {
        try {
            return hash(request);
        } catch (Exception exception) {
            throw new AssertionError(exception);
        }
    }
}
