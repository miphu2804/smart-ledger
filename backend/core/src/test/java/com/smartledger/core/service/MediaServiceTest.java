package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.smartledger.core.entity.AuthIdentity;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.enums.MediaAssetType;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.media.MediaDeliveryType;
import com.smartledger.core.media.MediaIdempotencyReplay;
import com.smartledger.core.media.MediaPublicIdFactory;
import com.smartledger.core.media.MediaStorage;
import com.smartledger.core.media.MultipartImageReader;
import com.smartledger.core.media.StoredMedia;
import com.smartledger.core.media.ValidatedImage;
import com.smartledger.core.repository.AuthIdentityRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.MediaServiceImpl;
import com.smartledger.core.service.impl.MediaWriteTransactionService;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.multipart.MultipartFile;

class MediaServiceTest {

    @Test
    void doesNotCallCloudinaryWhenAnotherRequestAlreadyReservedTheSameProductUpload() {
        ShopService shops = mock(ShopService.class);
        ProductRepository products = mock(ProductRepository.class);
        AuthIdentityRepository identities = mock(AuthIdentityRepository.class);
        MultipartImageReader images = mock(MultipartImageReader.class);
        MediaPublicIdFactory publicIds = mock(MediaPublicIdFactory.class);
        MediaStorage storage = mock(MediaStorage.class);
        MediaIdempotencyReplay replay = mock(MediaIdempotencyReplay.class);
        MediaWriteTransactionService writes = mock(MediaWriteTransactionService.class);
        MediaService service = new MediaServiceImpl(shops, products, identities, images, publicIds, storage, replay, writes);
        Shop shop = mock(Shop.class);
        Product product = mock(Product.class);
        MultipartFile file = mock(MultipartFile.class);
        ValidatedImage image = new ValidatedImage(new byte[] {1, 2}, "image/png", 1, 1, "hash");
        VerifiedFirebaseToken token = new VerifiedFirebaseToken("uid", "owner@example.test", true, null, "Thảo", null);
        when(shop.getId()).thenReturn(7L);
        when(shop.getOwnerId()).thenReturn(1L);
        when(product.getId()).thenReturn(9L);
        when(shops.requireOwnedActiveShop(token, "7")).thenReturn(shop);
        when(products.findByIdAndShopIdAndStatus(9L, 7L, CatalogStatus.ACTIVE)).thenReturn(java.util.Optional.of(product));
        when(images.read(file)).thenReturn(image);
        when(publicIds.create(MediaAssetType.PRODUCT_IMAGE, 7L, 9L, "same-key", "hash"))
                .thenReturn("shops/7/products/9/opaque");
        when(replay.reserve(eq(7L), eq(1L), eq("PRODUCT_IMAGE_UPLOAD"), eq("same-key"), any(), eq(ProductResponse.class)))
                .thenThrow(new BusinessException(ErrorCode.MEDIA_UPLOAD_IN_PROGRESS));

        assertThat(org.assertj.core.api.Assertions.catchThrowable(() ->
                service.uploadProductImage(token, "7", "9", "same-key", file)))
                .isInstanceOf(BusinessException.class)
                .extracting(error -> ((BusinessException) error).getErrorCode())
                .isEqualTo(ErrorCode.MEDIA_UPLOAD_IN_PROGRESS);

        verify(storage, never()).upload(any());
        verify(writes, never()).saveProductImage(any(), any(), any(), any());
    }

    @Test
    void uploadsAvatarAsAuthenticatedAndReturnsOnlySignedDeliveryUrl() {
        ShopService shops = mock(ShopService.class);
        ProductRepository products = mock(ProductRepository.class);
        AuthIdentityRepository identities = mock(AuthIdentityRepository.class);
        MultipartImageReader images = mock(MultipartImageReader.class);
        MediaPublicIdFactory publicIds = mock(MediaPublicIdFactory.class);
        MediaStorage storage = mock(MediaStorage.class);
        MediaIdempotencyReplay replay = mock(MediaIdempotencyReplay.class);
        MediaWriteTransactionService writes = mock(MediaWriteTransactionService.class);
        MediaService service = new MediaServiceImpl(shops, products, identities, images, publicIds, storage, replay, writes);
        VerifiedFirebaseToken token = new VerifiedFirebaseToken("uid", "owner@example.test", true, null, "Thảo", null);
        UserAccount user = mock(UserAccount.class);
        AuthIdentity identity = mock(AuthIdentity.class);
        MultipartFile file = mock(MultipartFile.class);
        ValidatedImage image = new ValidatedImage(new byte[] {1, 2}, "image/png", 1, 1, "hash");
        when(identity.getUser()).thenReturn(user);
        when(user.getId()).thenReturn(5L);
        when(user.getDisplayName()).thenReturn("Thảo");
        when(user.getEmail()).thenReturn("owner@example.test");
        when(identities.findWithUserByProviderSubject("uid")).thenReturn(Optional.of(identity));
        when(images.read(file)).thenReturn(image);
        when(publicIds.createAvatar(5L, "hash")).thenReturn("users/5/avatar/opaque");
        when(storage.upload(any())).thenReturn(new StoredMedia("users/5/avatar/opaque", "provider-private-url"));
        when(writes.saveAvatar(eq(user), any())).thenReturn("users/5/avatar/opaque");
        when(storage.authenticatedUrl("users/5/avatar/opaque"))
                .thenReturn("https://cdn.example/image/authenticated/s--signature--/avatar.png");

        var response = service.uploadAvatar(token, file);

        ArgumentCaptor<com.smartledger.core.media.MediaUpload> upload =
                ArgumentCaptor.forClass(com.smartledger.core.media.MediaUpload.class);
        verify(storage).upload(upload.capture());
        assertThat(upload.getValue().deliveryType()).isEqualTo(MediaDeliveryType.AUTHENTICATED);
        assertThat(response.avatarUrl()).contains("authenticated").contains("s--signature--");
        verify(publicIds).createAvatar(5L, "hash");
        verify(storage).authenticatedUrl("users/5/avatar/opaque");
    }
}
