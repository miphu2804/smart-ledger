package com.smartledger.core.media;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.repository.MediaUploadKeyRepository;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

class MediaIdempotencyReplayTest {
    private final ObjectMapper mapper = new ObjectMapper();
    private final MediaUploadKeyRepository repository = mock(MediaUploadKeyRepository.class);
    private final MediaIdempotencyReplay replay = new MediaIdempotencyReplay(repository, mapper, 30, 300);
    private final MediaUploadRequest request = new MediaUploadRequest("public-id", "file-hash");

    @Test void rejectsPendingAndConflictingRequests() throws Exception {
        when(repository.findOptional(any(), any(), any())).thenReturn(Optional.of(stored(null, false)));
        assertThatThrownBy(() -> replay.reserve(7L, 1L, "UPLOAD", "key", request, String.class))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getErrorCode())
                        .isEqualTo(ErrorCode.MEDIA_UPLOAD_IN_PROGRESS));
        assertThatThrownBy(() -> replay.reserve(7L, 2L, "UPLOAD", "key", request, String.class))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getErrorCode())
                        .isEqualTo(ErrorCode.IDEMPOTENCY_KEY_CONFLICT));
    }

    @Test void returnsCompletedSnapshot() throws Exception {
        when(repository.findOptional(any(), any(), any())).thenReturn(Optional.of(stored("\"saved\"", false)));
        assertThat(replay.reserve(7L, 1L, "UPLOAD", "key", request, String.class).replay()).isEqualTo("saved");
    }

    @Test void reclaimsWithCompareAndSetInsteadOfDeletingTheOldLease() throws Exception {
        var old = stored(null, true);
        when(repository.findOptional(any(), any(), any())).thenReturn(Optional.of(old));
        when(repository.reclaim(any(), any(), any(), any(), any(), any())).thenReturn(true);
        var result = replay.reserve(7L, 1L, "UPLOAD", "key", request, String.class);
        assertThat(result.leaseToken()).isNotEqualTo(old.leaseToken());
        verify(repository).reclaim(eq("SHOP:7"), eq("UPLOAD"), eq("key"), eq(old.leaseToken()),
                eq(result.leaseToken()), any());
        replay.release(7L, 1L, "UPLOAD", result);
        verify(repository).releasePending("SHOP:7", "UPLOAD", "key", result.leaseToken());
    }

    @Test void avatarReservationIsUserScopedAndNeverNeedsAShop() {
        when(repository.reserve(any(), any(), any(), any(), any(), any(), any(), any())).thenReturn(true);
        var result = replay.reserve(null, 5L, "USER_AVATAR_UPLOAD", "key", request, String.class);
        verify(repository).reserve(eq("USER:5"), eq(5L), eq("USER_AVATAR_UPLOAD"), eq("key"), any(),
                eq("public-id"), eq(result.leaseToken()), any());
        replay.lockPending(null, 5L, "USER_AVATAR_UPLOAD", result);
        verify(repository).lockPending("USER:5", "USER_AVATAR_UPLOAD", "key", result.leaseToken());
    }

    private MediaUploadKeyRepository.StoredResult stored(String body, boolean expired) throws Exception {
        String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(mapper.writeValueAsBytes(request)));
        return new MediaUploadKeyRepository.StoredResult(1L, hash, body,
                OffsetDateTime.now().plusSeconds(expired ? -1 : 300), UUID.randomUUID());
    }
}
