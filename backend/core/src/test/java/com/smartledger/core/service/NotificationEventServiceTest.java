package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.smartledger.core.entity.*;
import com.smartledger.core.enums.*;
import com.smartledger.core.repository.*;
import com.smartledger.core.service.impl.NotificationEventServiceImpl;
import java.math.BigDecimal;
import java.util.*;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

class NotificationEventServiceTest {
    private final NotificationEventRepository events = mock(NotificationEventRepository.class);
    private final NotificationRecipientRepository recipients = mock(NotificationRecipientRepository.class);
    private final NotificationEventService service = new NotificationEventServiceImpl(events, recipients);
    private Shop shop;
    private Product product;

    @BeforeEach void seed() {
        shop = Shop.create(42L, "Shop", "Retail", null, null);
        ReflectionTestUtils.setField(shop, "id", 7L);
        product = Product.create(7L);
        ReflectionTestUtils.setField(product, "id", 1L);
        product.replace(null, "Product", null, null, "piece", 10_000L, null, true, BigDecimal.ONE);
        when(events.findAllByShopIdAndEntityTypeAndEntityIdAndTypeInAndResolvedAtIsNull(any(), any(), any(), any()))
                .thenReturn(List.of());
        when(events.findFirstByShopIdAndEntityTypeAndEntityIdOrderByIdDesc(any(), any(), any())).thenReturn(Optional.empty());
        when(events.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
    }

    @Test void nullThresholdDoesNotInventALowStockWarning() {
        service.reconcileStock(shop, product);
        verify(events, never()).saveAndFlush(any());
        verifyNoInteractions(recipients);
    }

    @Test void thresholdCreatesOneOwnerRecipientAndInternalSourceKey() {
        product.setLowStockThreshold(new BigDecimal("1.500"));
        service.reconcileStock(shop, product);
        var event = ArgumentCaptor.forClass(NotificationEvent.class);
        verify(events).saveAndFlush(event.capture());
        assertThat(event.getValue().getType()).isEqualTo(NotificationType.LOW_STOCK);
        assertThat(event.getValue().getDedupKey()).isEqualTo("stock:1:LOW_STOCK:0");
        var recipient = ArgumentCaptor.forClass(NotificationRecipient.class);
        verify(recipients).save(recipient.capture());
        assertThat(recipient.getValue().getUserId()).isEqualTo(42L);
        assertThat(recipient.getValue().getReadAt()).isNull();
    }

    @Test void sameOpenAlertDoesNotSpamOrChangeItsTimestamp() {
        product.setLowStockThreshold(BigDecimal.TEN);
        var existing = event(NotificationType.LOW_STOCK);
        when(events.findAllByShopIdAndEntityTypeAndEntityIdAndTypeInAndResolvedAtIsNull(any(), any(), any(), any()))
                .thenReturn(List.of(existing));
        service.reconcileStock(shop, product);
        assertThat(existing.getResolvedAt()).isNull();
        verify(events, never()).saveAndFlush(any());
    }

    @Test void zeroStockUpgradesTheAlertAndClosesThePreviousOne() {
        product.deductStock(BigDecimal.ONE);
        var existing = event(NotificationType.LOW_STOCK);
        ReflectionTestUtils.setField(existing, "id", 9L);
        when(events.findAllByShopIdAndEntityTypeAndEntityIdAndTypeInAndResolvedAtIsNull(any(), any(), any(), any()))
                .thenReturn(List.of(existing));
        when(events.findFirstByShopIdAndEntityTypeAndEntityIdOrderByIdDesc(any(), any(), any())).thenReturn(Optional.of(existing));
        service.reconcileStock(shop, product);
        assertThat(existing.getResolvedAt()).isNotNull();
        var event = ArgumentCaptor.forClass(NotificationEvent.class);
        verify(events).saveAndFlush(event.capture());
        assertThat(event.getValue().getDedupKey()).isEqualTo("stock:1:OUT_OF_STOCK:9");
    }

    @Test void archiveResolvesAnAlertWithoutDeletingHistory() {
        var existing = event(NotificationType.OUT_OF_STOCK);
        when(events.findAllByShopIdAndEntityTypeAndEntityIdAndTypeInAndResolvedAtIsNull(any(), any(), any(), any()))
                .thenReturn(List.of(existing));
        product.archive(42L);
        service.reconcileStock(shop, product);
        assertThat(existing.getResolvedAt()).isNotNull();
        verify(events, never()).saveAndFlush(any());
        verify(events, never()).delete(any());
    }

    @Test void statusNoOpDoesNotCreateAnotherEvent() {
        service.shopStatusChanged(shop, ShopStatus.ACTIVE);
        verify(events, never()).saveAndFlush(any());
    }

    @Test void duplicateSourceDoesNotCreateARecipientAgain() {
        shop.deactivate("Support");
        when(events.existsByShopIdAndDedupKey(any(), any())).thenReturn(true);
        service.shopStatusChanged(shop, ShopStatus.ACTIVE);
        verifyNoInteractions(recipients);
        verify(events, never()).saveAndFlush(any());
    }

    @Test void productThresholdRejectsNegativeOverflowOrExcessPrecision() {
        for (String value : List.of("-1", "1000000000000", "0.0001")) {
            assertThatThrownBy(() -> product.setLowStockThreshold(new BigDecimal(value))).isInstanceOf(IllegalArgumentException.class);
        }
        product.setLowStockThreshold(new BigDecimal("0.001"));
        assertThat(product.getLowStockThreshold()).isEqualByComparingTo("0.001");
        product.setLowStockThreshold(null);
        assertThat(product.getLowStockThreshold()).isNull();
    }

    private NotificationEvent event(NotificationType type) {
        return NotificationEvent.create(7L, type, "Title", "Body", "PRODUCT", 1L, "old-key", Map.of());
    }
}
