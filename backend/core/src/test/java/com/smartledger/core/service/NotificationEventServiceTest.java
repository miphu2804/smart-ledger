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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
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
        when(events.findAllByShopIdAndEntityTypeAndEntityIdInAndTypeInAndResolvedAtIsNull(any(), any(), any(), any()))
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
        when(events.findAllByShopIdAndEntityTypeAndEntityIdInAndTypeInAndResolvedAtIsNull(any(), any(), any(), any()))
                .thenReturn(List.of(existing));
        service.reconcileStock(shop, product);
        assertThat(existing.getResolvedAt()).isNull();
        verify(events, never()).saveAndFlush(any());
    }

    @Test void zeroStockUpgradesTheAlertAndClosesThePreviousOne() {
        product.deductStock(BigDecimal.ONE);
        var existing = event(NotificationType.LOW_STOCK);
        ReflectionTestUtils.setField(existing, "id", 9L);
        when(events.findAllByShopIdAndEntityTypeAndEntityIdInAndTypeInAndResolvedAtIsNull(any(), any(), any(), any()))
                .thenReturn(List.of(existing));
        when(events.findFirstByShopIdAndEntityTypeAndEntityIdOrderByIdDesc(any(), any(), any())).thenReturn(Optional.of(existing));
        service.reconcileStock(shop, product);
        assertThat(existing.getResolvedAt()).isNotNull();
        var event = ArgumentCaptor.forClass(NotificationEvent.class);
        verify(events).saveAndFlush(event.capture());
        assertThat(event.getValue().getDedupKey()).isEqualTo("stock:1:OUT_OF_STOCK:9");
        var writes = inOrder(events);
        writes.verify(events).flush();
        writes.verify(events).saveAndFlush(any());
    }

    @Test void archiveResolvesAnAlertWithoutDeletingHistory() {
        var existing = event(NotificationType.OUT_OF_STOCK);
        when(events.findAllByShopIdAndEntityTypeAndEntityIdInAndTypeInAndResolvedAtIsNull(any(), any(), any(), any()))
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

    @Test void emptyProductCollectionDoesNotReadOrWriteNotifications() {
        service.reconcileStock(shop, List.of());
        verifyNoInteractions(events, recipients);
    }

    @Test void singleProductUsesTheBatchRead() {
        service.reconcileStock(shop, product);
        verify(events).findAllByShopIdAndEntityTypeAndEntityIdInAndTypeInAndResolvedAtIsNull(
                7L, "PRODUCT", List.of(1L), List.of(NotificationType.LOW_STOCK, NotificationType.OUT_OF_STOCK));
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 20, 100, 10_000})
    void unchangedProductsUseOneOpenAlertReadAndNoOtherQueries(int count) {
        var products = new ArrayList<Product>();
        var open = new ArrayList<NotificationEvent>();
        for (int index = 1; index <= count; index++) {
            Product next = product(index, index % 3 == 0 ? BigDecimal.ZERO : BigDecimal.ONE,
                    index % 3 == 1 ? null : BigDecimal.TEN);
            products.add(next);
            if (index % 3 != 1) open.add(event(index, index % 3 == 0
                    ? NotificationType.OUT_OF_STOCK : NotificationType.LOW_STOCK));
        }
        when(events.findAllByShopIdAndEntityTypeAndEntityIdInAndTypeInAndResolvedAtIsNull(any(), any(), any(), any()))
                .thenReturn(open.reversed());

        service.reconcileStock(shop, products);

        verify(events).findAllByShopIdAndEntityTypeAndEntityIdInAndTypeInAndResolvedAtIsNull(
                7L, "PRODUCT", products.stream().map(Product::getId).toList(),
                List.of(NotificationType.LOW_STOCK, NotificationType.OUT_OF_STOCK));
        verifyNoMoreInteractions(events);
        verifyNoInteractions(recipients);
        assertThat(open).allSatisfy(event -> assertThat(event.getResolvedAt()).isNull());
    }

    @Test void mixedBatchGroupsAlertsByProductAndPreservesLifecycle() {
        Product toOut = product(1, BigDecimal.ZERO, BigDecimal.TEN);
        Product recovered = product(2, BigDecimal.TEN, BigDecimal.ONE);
        Product unchanged = product(3, BigDecimal.ONE, BigDecimal.TEN);
        Product newLow = product(4, BigDecimal.ONE, BigDecimal.TEN);
        var low = event(1, NotificationType.LOW_STOCK);
        ReflectionTestUtils.setField(low, "id", 9L);
        var out = event(2, NotificationType.OUT_OF_STOCK);
        var same = event(3, NotificationType.LOW_STOCK);
        when(events.findAllByShopIdAndEntityTypeAndEntityIdInAndTypeInAndResolvedAtIsNull(any(), any(), any(), any()))
                .thenReturn(List.of(same, out, low));
        when(events.findFirstByShopIdAndEntityTypeAndEntityIdOrderByIdDesc(7L, "PRODUCT", 1L))
                .thenReturn(Optional.of(low));

        service.reconcileStock(shop, List.of(toOut, recovered, unchanged, newLow));

        assertThat(low.getResolvedAt()).isNotNull();
        assertThat(out.getResolvedAt()).isNotNull();
        assertThat(same.getResolvedAt()).isNull();
        verify(events).findAllByShopIdAndEntityTypeAndEntityIdInAndTypeInAndResolvedAtIsNull(
                eq(7L), eq("PRODUCT"), eq(List.of(1L, 2L, 3L, 4L)), any());
        verify(events, times(2)).flush();
        var saved = ArgumentCaptor.forClass(NotificationEvent.class);
        verify(events, times(2)).saveAndFlush(saved.capture());
        assertThat(saved.getAllValues()).extracting(NotificationEvent::getDedupKey)
                .containsExactly("stock:1:OUT_OF_STOCK:9", "stock:4:LOW_STOCK:0");
        verify(recipients, times(2)).save(any());
        verify(events, never()).delete(any());
    }

    @Test void duplicateProductIdsAreReconciledOnlyOnce() {
        product.setLowStockThreshold(BigDecimal.TEN);
        service.reconcileStock(shop, List.of(product, product));
        verify(events).findAllByShopIdAndEntityTypeAndEntityIdInAndTypeInAndResolvedAtIsNull(
                eq(7L), eq("PRODUCT"), eq(List.of(1L)), any());
        verify(events).saveAndFlush(any());
        verify(recipients).save(any());
    }

    private Product product(long id, BigDecimal stock, BigDecimal threshold) {
        var result = Product.create(7L);
        ReflectionTestUtils.setField(result, "id", id);
        result.replace(null, "Product " + id, null, null, "piece", 10_000L, null, true, stock);
        result.setLowStockThreshold(threshold);
        return result;
    }

    private NotificationEvent event(long productId, NotificationType type) {
        return NotificationEvent.create(7L, type, "Title", "Body", "PRODUCT", productId, "old-" + productId, Map.of());
    }

    private NotificationEvent event(NotificationType type) {
        return NotificationEvent.create(7L, type, "Title", "Body", "PRODUCT", 1L, "old-key", Map.of());
    }
}
