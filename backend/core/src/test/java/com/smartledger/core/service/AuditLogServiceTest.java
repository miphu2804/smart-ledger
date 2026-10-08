package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.smartledger.core.entity.AuditLog;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.PaymentMethod;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.enums.SystemRole;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.AuditLogRepository;
import com.smartledger.core.service.impl.AuditLogServiceImpl;
import com.smartledger.core.service.impl.AuditLogQueryServiceImpl;
import java.time.OffsetDateTime;
import java.math.BigDecimal;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

class AuditLogServiceTest {
    private final AuditLogRepository repository = mock(AuditLogRepository.class);
    private final ShopService shops = mock(ShopService.class);
    private final AuditLogService service = new AuditLogServiceImpl(repository);
    private final AuditLogQueryService query = new AuditLogQueryServiceImpl(repository, shops);

    @AfterEach
    void clearContext() {
        RequestContextHolder.resetRequestAttributes();
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(false);
    }

    @Test
    void recordsTrustedActorAndSafeContextWithUtcTime() {
        var request = new MockHttpServletRequest();
        request.addHeader("X-Trace-Id", "Bearer secret-do-not-store");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        service.record(7L, 42L, SystemRole.OWNER, AuditAction.SALE_VOIDED, 15L,
                "  Returned  ", "  void-key  ", Map.of("refundedVnd", 40_000L, "restockItems", true));
        var captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(repository).append(captor.capture());
        var event = captor.getValue();
        assertThat(event.getActorUserId()).isEqualTo(42L);
        assertThat(event.getActorRole()).isEqualTo(SystemRole.OWNER);
        assertThat(event.getShopId()).isEqualTo(7L);
        assertThat(event.getEntityType()).isEqualTo("SALE");
        assertThat(event.getEntityId()).isEqualTo(15L);
        assertThat(event.getOutcome()).isEqualTo("SUCCESS");
        assertThat(event.getReason()).isEqualTo("Returned");
        assertThat(event.getIdempotencyKey()).isEqualTo("void-key");
        assertThat(event.getRequestId()).matches("[a-f0-9-]{36}");
        assertThat(event.getCreatedAt().getOffset()).isEqualTo(ZoneOffset.UTC);
        assertThat(event.getMetadata()).containsEntry("refundedVnd", 40_000L)
                .doesNotContainKey("token");
    }

    @Test
    void rejectsUnknownSensitiveMetadataAndUnexpectedStringValues() {
        for (var data : List.of(Map.<String, Object>of("customerPhone", "0901234567"),
                Map.<String, Object>of("refundedVnd", "token"),
                Map.<String, Object>of("restockItems", "false"))) {
            assertThatThrownBy(() -> service.record(7L, 42L, SystemRole.OWNER,
                    AuditAction.SALE_VOIDED, 15L, null, null, data))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        verifyNoInteractions(repository);
    }

    @Test
    void acceptsJsonDecimalHydrationButRejectsNonFiniteNumbers() {
        var event = AuditLog.success(7L, 42L, SystemRole.OWNER, AuditAction.STOCK_ADJUSTED, 8L,
                null, java.util.UUID.randomUUID().toString(), null, Map.of("afterStock", new BigDecimal("12.125")));
        ReflectionTestUtils.setField(event, "metadata", new HashMap<>(Map.of("afterStock", 12.125d)));
        assertThat(event.getMetadata()).containsEntry("afterStock", 12.125d);
        assertThatThrownBy(() -> event.getMetadata().put("afterStock", 1)).isInstanceOf(UnsupportedOperationException.class);
        for (double number : new double[] { Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY }) {
            assertThatThrownBy(() -> AuditLog.success(7L, 42L, SystemRole.OWNER, AuditAction.STOCK_ADJUSTED, 8L,
                    null, java.util.UUID.randomUUID().toString(), null, Map.of("afterStock", number)))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Test
    void acceptsEveryCurrentPaymentMethodAndShopStatus() {
        for (PaymentMethod method : PaymentMethod.values()) {
            var event = AuditLog.success(7L, 42L, SystemRole.OWNER, AuditAction.EXPENSE_CREATED, 8L,
                    null, java.util.UUID.randomUUID().toString(), null,
                    Map.of("amountVnd", 1_000L, "paymentMethod", method));
            assertThat(event.getMetadata()).containsEntry("paymentMethod", method.name());
        }
        for (ShopStatus status : ShopStatus.values()) {
            var event = AuditLog.success(7L, 42L, SystemRole.ADMIN, AuditAction.SHOP_INACTIVATED, 7L,
                    null, java.util.UUID.randomUUID().toString(), null,
                    Map.of("beforeStatus", status, "afterStatus", status));
            assertThat(event.getMetadata()).containsEntry("afterStatus", status.name());
        }
    }

    @Test
    void readsAStoredRowEvenIfItsMetadataNoLongerPassesWriteValidation() {
        var event = AuditLog.success(7L, 42L, SystemRole.OWNER, AuditAction.SALE_VOIDED, 15L,
                null, java.util.UUID.randomUUID().toString(), null, Map.of("refundedVnd", 1L));
        ReflectionTestUtils.setField(event, "metadata", new HashMap<>(Map.of("retiredKey", "legacy")));

        assertThat(event.getMetadata()).containsEntry("retiredKey", "legacy");
        assertThatThrownBy(() -> event.getMetadata().put("refundedVnd", 1L))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void capturesImmutableMetadataAndReusesServerRequestId() {
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(new MockHttpServletRequest()));
        var mutable = new HashMap<String, Object>();
        mutable.put("amountVnd", 20_000L);
        service.record(7L, 42L, SystemRole.OWNER, AuditAction.EXPENSE_CREATED, 8L, null, "create", mutable);
        mutable.put("amountVnd", 99L);
        service.record(7L, 42L, SystemRole.OWNER, AuditAction.EXPENSE_ARCHIVED, 8L, null, null, Map.of());
        var captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(repository, org.mockito.Mockito.times(2)).append(captor.capture());
        var first = captor.getAllValues().getFirst();
        assertThat(first.getMetadata()).containsEntry("amountVnd", 20_000L);
        assertThat(first.getRequestId()).isEqualTo(captor.getAllValues().getLast().getRequestId());
        assertThatThrownBy(() -> first.getMetadata().put("amountVnd", 1L))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void requiresBusinessTransactionAndRejectsReadOnlyTransaction() throws Exception {
        var method = AuditLogServiceImpl.class.getMethod("record", Long.class, Long.class,
                SystemRole.class, AuditAction.class, Long.class, String.class, String.class, Map.class);
        assertThat(method.getAnnotation(Transactional.class).propagation()).isEqualTo(Propagation.MANDATORY);
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(true);
        assertThatThrownBy(() -> service.record(7L, 42L, SystemRole.OWNER,
                AuditAction.EXPENSE_CREATED, 8L, null, null, Map.of()))
                .isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(repository);
    }

    @Test
    void listsOnlyAuthorizedShopWithBoundedPagination() {
        var shop = Shop.create(42L, "Shop", null, null, null);
        ReflectionTestUtils.setField(shop, "id", 7L);
        when(shops.requireOwnedActiveShop(null, "7")).thenReturn(shop);
        when(repository.search(7L, null, null, null, null, PageRequest.of(0, 20)))
                .thenReturn(new PageImpl<>(List.of()));
        assertThat(query.list(null, "7", null, null, null, null, 0, 20).content()).isEmpty();
        verify(repository).search(7L, null, null, null, null, PageRequest.of(0, 20));
    }

    @Test
    void crossShopDenialDoesNotReadAuditData() {
        when(shops.requireOwnedActiveShop(any(), any())).thenThrow(new BusinessException(ErrorCode.SHOP_ACCESS_DENIED));
        assertThatThrownBy(() -> query.list(null, "8", null, null, null, null, 0, 20))
                .isInstanceOf(BusinessException.class);
        verifyNoInteractions(repository);
    }

    @Test
    void rejectsInvalidPagesTargetIdsAndTimeRange() {
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        assertThatThrownBy(() -> query.list(null, "7", null, null, null, null, -1, 20)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> query.list(null, "7", null, null, null, null, 0, 101)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> query.list(null, "7", null, 0L, null, null, 0, 20)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> query.list(null, "7", null, null, now, now, 0, 20)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(repository);
    }
}
