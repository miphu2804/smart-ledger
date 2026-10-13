package com.smartledger.core.media;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class CloudinaryMediaStorageTest {

    private final CloudinaryGateway gateway = Mockito.mock(CloudinaryGateway.class);
    private final MediaStorage storage = new CloudinaryMediaStorage(gateway);

    @Test
    void uploadsOnlyValidatedBytesWithTheCallerSuppliedDeterministicPublicId() {
        byte[] bytes = new byte[] {1, 2, 3};
        MediaUpload upload = new MediaUpload("shops/7/products/9/request-hash", "image/png", bytes);
        when(gateway.upload(eq(bytes), eq("image/png"), eq(upload.publicId()), eq(MediaDeliveryType.PUBLIC)))
                .thenReturn(Map.of("public_id", upload.publicId(), "secure_url", "https://cdn.example/image.png"));

        StoredMedia result = storage.upload(upload);

        assertThat(result.publicId()).isEqualTo(upload.publicId());
        assertThat(result.secureUrl()).isEqualTo("https://cdn.example/image.png");
        verify(gateway).upload(bytes, "image/png", upload.publicId(), MediaDeliveryType.PUBLIC);
    }

    @Test
    void turnsProviderFailuresIntoARetryableMediaUnavailableError() {
        when(gateway.upload(any(), any(), any(), any())).thenThrow(new IllegalStateException("provider down"));

        assertThatThrownBy(() -> storage.upload(new MediaUpload("products/9/a", "image/png", new byte[] {1})))
                .isInstanceOfSatisfying(BusinessException.class,
                        ex -> assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.MEDIA_UNAVAILABLE));
    }

    @Test
    void unavailableStorageDoesNotPretendThatAnUploadSucceeded() {
        MediaStorage unavailable = new UnavailableMediaStorage();

        assertThatThrownBy(() -> unavailable.upload(new MediaUpload("products/9/a", "image/png", new byte[] {1})))
                .isInstanceOfSatisfying(BusinessException.class,
                        ex -> assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.MEDIA_UNAVAILABLE));
    }

    @Test
    void suppliesASignedAuthenticatedUrlOnlyThroughTheStoragePort() {
        when(gateway.authenticatedUrl("users/1/avatar/opaque"))
                .thenReturn("https://cdn.example/image/authenticated/s--signature--/avatar.png");

        String url = storage.authenticatedUrl("users/1/avatar/opaque");

        assertThat(url).contains("authenticated").contains("s--signature--");
        verify(gateway).authenticatedUrl("users/1/avatar/opaque");
    }
}
