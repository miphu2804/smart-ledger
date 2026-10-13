package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.smartledger.core.entity.*;
import com.smartledger.core.enums.*;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.media.*;
import com.smartledger.core.repository.*;
import com.smartledger.core.service.impl.MediaWriteTransactionService;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class MediaDeleteTest {
    private final ProductRepository products = mock(ProductRepository.class);
    private final ShopRepository shops = mock(ShopRepository.class);
    private final UserAccountRepository users = mock(UserAccountRepository.class);
    private final MediaCleanupJobService jobs = mock(MediaCleanupJobService.class);
    private final AuditLogService audit = mock(AuditLogService.class);
    private final MediaWriteTransactionService writes = new MediaWriteTransactionService(products, shops, users,
            mock(MediaIdempotencyReplay.class), jobs, audit, new UnavailableMediaStorage(), mock(JdbcTemplate.class));

    @Test void disabledMediaDoesNotClearExistingProductLogoOrAvatar() {
        Shop shop = shop();
        Product product = Product.create(7L);
        product.replaceCloudinaryImage("https://cdn.test/product.png", "product-id");
        shop.replaceCloudinaryLogo("https://cdn.test/logo.png", "logo-id");
        UserAccount user = user();
        user.replaceCloudinaryAvatar("avatar-id");
        when(products.findLockedByIdAndShopIdAndStatus(any(), any(), any())).thenReturn(Optional.of(product));
        when(users.findLockedById(any())).thenReturn(Optional.of(user));
        assertUnavailable(() -> writes.clearProductImage(shop, 9L));
        assertUnavailable(() -> writes.clearShopLogo(shop));
        assertUnavailable(() -> writes.clearAvatar(user));
        assertThat(product.getImagePublicId()).isEqualTo("product-id");
        assertThat(shop.getLogoPublicId()).isEqualTo("logo-id");
        assertThat(user.getAvatarPublicId()).isEqualTo("avatar-id");
        verifyNoInteractions(jobs, audit);
    }

    @Test void absentCustomMediaRemainsANoOpEvenWhenDisabled() {
        Shop shop = shop();
        Product product = Product.create(7L);
        UserAccount user = user();
        when(products.findLockedByIdAndShopIdAndStatus(any(), any(), any())).thenReturn(Optional.of(product));
        when(users.findLockedById(any())).thenReturn(Optional.of(user));
        writes.clearProductImage(shop, 9L);
        writes.clearShopLogo(shop);
        writes.clearAvatar(user);
        assertThat(user.getAvatarUrl()).isEqualTo("https://firebase.test/avatar.png");
        verifyNoInteractions(jobs, audit);
    }

    @Test void inactiveShopErrorRetainsTheReason() {
        Shop shop = shop();
        shop.deactivate("Support review");
        assertThatThrownBy(() -> writes.clearShopLogo(shop)).isInstanceOfSatisfying(BusinessException.class,
                ex -> assertThat(ex.getDetails()).containsExactly(
                        new com.smartledger.core.exception.ApiErrorDetail("inactiveReason", "Support review")));
    }

    private Shop shop() {
        Shop shop = Shop.create(1L, "Shop", "Retail", null, null);
        when(shops.findLockedByIdAndOwnerId(any(), any())).thenReturn(Optional.of(shop));
        return shop;
    }
    private UserAccount user() {
        return UserAccount.createOwner("User", new com.smartledger.core.security.VerifiedFirebaseToken(
                "uid", null, false, null, null, "https://firebase.test/avatar.png"));
    }
    private void assertUnavailable(org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(BusinessException.class,
                ex -> assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.MEDIA_UNAVAILABLE));
    }
}
