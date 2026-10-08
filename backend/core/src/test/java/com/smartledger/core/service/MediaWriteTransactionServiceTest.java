package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.smartledger.core.entity.Shop;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.enums.UserStatus;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.media.MediaIdempotencyReplay;
import com.smartledger.core.media.StoredMedia;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.repository.ShopRepository;
import com.smartledger.core.repository.UserAccountRepository;
import com.smartledger.core.service.impl.MediaWriteTransactionService;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class MediaWriteTransactionServiceTest {

    @Test
    void rejectsTheFinalProductWriteWhenTheShopWasInactivatedDuringUpload() {
        ProductRepository products = mock(ProductRepository.class);
        ShopRepository shops = mock(ShopRepository.class);
        UserAccountRepository users = mock(UserAccountRepository.class);
        MediaIdempotencyReplay idempotency = mock(MediaIdempotencyReplay.class);
        MediaCleanupJobService cleanup = mock(MediaCleanupJobService.class);
        AuditLogService audit = mock(AuditLogService.class);
        MediaWriteTransactionService writes = new MediaWriteTransactionService(products, shops, users, idempotency,
                cleanup, audit, mock(com.smartledger.core.media.MediaStorage.class), mock(org.springframework.jdbc.core.JdbcTemplate.class));
        Shop beforeUpload = mock(Shop.class);
        Shop inactiveAtWrite = mock(Shop.class);
        when(beforeUpload.getId()).thenReturn(7L);
        when(beforeUpload.getOwnerId()).thenReturn(1L);
        when(inactiveAtWrite.getStatus()).thenReturn(ShopStatus.INACTIVE);
        when(shops.findLockedByIdAndOwnerId(7L, 1L)).thenReturn(Optional.of(inactiveAtWrite));

        assertThatThrownBy(() -> writes.saveProductImage(beforeUpload, 9L,
                MediaIdempotencyReplay.Reservation.pending("key", "hash"),
                new StoredMedia("new-public-id", "https://cdn.example/new.png")))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> org.assertj.core.api.Assertions.assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.SHOP_INACTIVE));

        verify(products, never()).findLockedByIdAndShopIdAndStatus(any(), any(), any());
        verify(idempotency, never()).complete(any(), any(), any(), any(), any());
    }

    @Test
    void rejectsTheFinalAvatarWriteWhenTheUserWasDisabledDuringUpload() {
        ProductRepository products = mock(ProductRepository.class);
        ShopRepository shops = mock(ShopRepository.class);
        UserAccountRepository users = mock(UserAccountRepository.class);
        MediaIdempotencyReplay idempotency = mock(MediaIdempotencyReplay.class);
        MediaCleanupJobService cleanup = mock(MediaCleanupJobService.class);
        AuditLogService audit = mock(AuditLogService.class);
        MediaWriteTransactionService writes = new MediaWriteTransactionService(products, shops, users, idempotency,
                cleanup, audit, mock(com.smartledger.core.media.MediaStorage.class), mock(org.springframework.jdbc.core.JdbcTemplate.class));
        UserAccount beforeUpload = mock(UserAccount.class);
        UserAccount disabledAtWrite = mock(UserAccount.class);
        when(beforeUpload.getId()).thenReturn(1L);
        when(disabledAtWrite.getStatus()).thenReturn(UserStatus.DISABLED);
        when(users.findLockedById(1L)).thenReturn(Optional.of(disabledAtWrite));

        assertThatThrownBy(() -> writes.saveAvatar(beforeUpload, MediaIdempotencyReplay.Reservation.pending("key", "hash"),
                new StoredMedia("users/1/avatar/new", "https://provider.example/private")))
                .isInstanceOfSatisfying(BusinessException.class,
                        exception -> org.assertj.core.api.Assertions.assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.ACCOUNT_DISABLED));

        verify(idempotency, never()).complete(any(), any(), any(), any(), any());
    }
}
