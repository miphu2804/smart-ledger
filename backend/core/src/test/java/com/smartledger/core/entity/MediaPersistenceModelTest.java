package com.smartledger.core.entity;

import static org.assertj.core.api.Assertions.assertThat;

import com.smartledger.core.enums.MediaAssetType;
import com.smartledger.core.enums.MediaCleanupStatus;
import com.smartledger.core.security.VerifiedFirebaseToken;
import org.junit.jupiter.api.Test;

class MediaPersistenceModelTest {

    @Test
    void productAndShopKeepCloudinaryUrlAndPublicIdTogether() {
        Product product = Product.create(7L);
        Shop shop = Shop.create(1L, "Tiệm Thảo", "Grocery", null, null);

        product.replaceCloudinaryImage("https://cdn.example/product.png", "shops/7/products/9/v1");
        shop.replaceCloudinaryLogo("https://cdn.example/logo.png", "shops/7/logo/v1");

        assertThat(product.getImageUrl()).isEqualTo("https://cdn.example/product.png");
        assertThat(product.getImagePublicId()).isEqualTo("shops/7/products/9/v1");
        assertThat(shop.getLogoUrl()).isEqualTo("https://cdn.example/logo.png");
        assertThat(shop.getLogoPublicId()).isEqualTo("shops/7/logo/v1");
    }

    @Test
    void firebaseSyncDoesNotOverwriteACoreManagedAvatar() {
        UserAccount user = UserAccount.createOwner("Thảo", token("https://firebase.example/avatar.png"));
        user.replaceCloudinaryAvatar("users/1/avatar/v1");

        user.syncFirebaseProfile(token("https://firebase.example/new-avatar.png"));

        assertThat(user.getAvatarUrl()).isEqualTo("https://firebase.example/new-avatar.png");
        assertThat(user.getAvatarPublicId()).isEqualTo("users/1/avatar/v1");
        user.clearCloudinaryAvatar();
        assertThat(user.getAvatarPublicId()).isNull();
        assertThat(user.getAvatarUrl()).isEqualTo("https://firebase.example/new-avatar.png");
    }

    @Test
    void cleanupJobStartsPendingAndCanBeMarkedCompleted() {
        MediaCleanupJob job = MediaCleanupJob.create("shops/7/products/9/old", MediaAssetType.PRODUCT_IMAGE);

        assertThat(job.getStatus()).isEqualTo(MediaCleanupStatus.PENDING);
        assertThat(job.getAttemptCount()).isZero();
        assertThat(job.getCompletedAt()).isNull();

        job.markCompleted();

        assertThat(job.getStatus()).isEqualTo(MediaCleanupStatus.COMPLETED);
        assertThat(job.getCompletedAt()).isNotNull();
    }

    private static VerifiedFirebaseToken token(String avatarUrl) {
        return new VerifiedFirebaseToken("firebase-uid", "thao@example.test", true, null, "Thảo", avatarUrl);
    }
}
