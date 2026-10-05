package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.smartledger.core.entity.AuditLog;
import com.smartledger.core.enums.*;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.AdminDashboardRepository;
import com.smartledger.core.repository.AuditLogRepository;
import com.smartledger.core.service.impl.AuditLogServiceImpl;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

class AdminAccessAuditServiceTest {
    private final AuditLogRepository repository = mock(AuditLogRepository.class);
    private final AdminAccessAuditService service = new AdminAccessAuditService(repository);

    @AfterEach void resetContext() {
        RequestContextHolder.resetRequestAttributes(); TransactionSynchronizationManager.setCurrentTransactionReadOnly(false);
    }

    @Test void serverGeneratesRequestIdAndNeverTrustsClientHeaders() {
        var request = new MockHttpServletRequest(); request.addHeader("X-Request-Id", "client");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        service.record(42, AdminAccessAction.SHOP_VIEWED, 7L, 7L, false, 1);
        service.record(42, AdminAccessAction.SHOP_STATUS_HISTORY_VIEWED, 7L, 7L, false, 2);
        var events = ArgumentCaptor.forClass(AuditLog.class); verify(repository, times(2)).append(events.capture());
        assertThat(events.getAllValues()).extracting(AuditLog::getRequestId).containsOnly(events.getValue().getRequestId());
        assertThat(UUID.fromString(events.getValue().getRequestId())).isNotNull();
        assertThat(events.getValue().getRequestId()).isNotEqualTo("client");
    }

    @Test void failureIsNotBestEffortAndReadOnlyTransactionIsRejected() {
        doThrow(new DataAccessResourceFailureException("offline")).when(repository).append(any());
        assertThatThrownBy(() -> service.record(42, AdminAccessAction.OVERVIEW_VIEWED, null, null, false, 1))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.ADMIN_AUDIT_UNAVAILABLE));
        TransactionSynchronizationManager.setCurrentTransactionReadOnly(true);
        assertThatThrownBy(() -> service.record(42, AdminAccessAction.OVERVIEW_VIEWED, null, null, false, 1))
                .isInstanceOf(IllegalStateException.class);
        verify(repository, times(1)).append(any());
    }

    @Test void rejectsInconsistentTargetsAndNeverNeedsFakeShopIds() {
        service.record(42, AdminAccessAction.OWNER_VIEWED, 12L, null, false, 1);
        service.record(42, AdminAccessAction.OVERVIEW_VIEWED, null, null, false, 1);
        var events = ArgumentCaptor.forClass(AuditLog.class); verify(repository, times(2)).append(events.capture());
        assertThat(events.getAllValues()).extracting(AuditLog::getShopId).containsOnlyNulls();
        assertThat(events.getValue().getEntityId()).isNull();
        assertThatThrownBy(() -> service.record(42, AdminAccessAction.SHOP_VIEWED, 7L, 8L, false, 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.record(42, AdminAccessAction.SHOP_VIEWED, null, null, false, 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.record(42, AdminAccessAction.OVERVIEW_VIEWED, 7L, null, false, 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.record(42, AdminAccessAction.OVERVIEW_VIEWED, null, 7L, false, 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.record(0, AdminAccessAction.OVERVIEW_VIEWED, null, null, false, 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.record(42, AdminAccessAction.SHOP_VIEWED, 7L, 7L, true, 1))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test void masksNullAndVeryShortContactsWithoutRevealingFullValues() {
        assertThat(AdminDashboardRepository.maskEmail(null)).isNull();
        assertThat(AdminDashboardRepository.maskEmail("a@b.test")).isEqualTo("***@***");
        assertThat(AdminDashboardRepository.maskPhone(null)).isNull();
        assertThat(AdminDashboardRepository.maskPhone("123")).isEqualTo("***");
        assertThat(AdminDashboardRepository.maskPhone("0901234567")).isEqualTo("***567");
    }

    @Test void statusAuditIsTrustedAndSharesRequestIdWithBusinessAudit() {
        var request = new MockHttpServletRequest(); request.addHeader("X-Request-Id", "forged");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        var businessRepository = mock(AuditLogRepository.class);
        var businessService = new AuditLogServiceImpl(businessRepository);
        businessService.record(7L, 42L, SystemRole.ADMIN, AuditAction.SHOP_INACTIVATED, 7L, "Paused", null,
                java.util.Map.of("beforeStatus", ShopStatus.ACTIVE, "afterStatus", ShopStatus.INACTIVE));
        service.recordShopStatus(42L, 7L, ShopStatus.ACTIVE, ShopStatus.INACTIVE, "  Paused  ");
        var administrative = ArgumentCaptor.forClass(AuditLog.class);
        var business = ArgumentCaptor.forClass(com.smartledger.core.entity.AuditLog.class);
        verify(repository).append(administrative.capture()); verify(businessRepository).append(business.capture());
        assertThat(administrative.getValue().getRequestId()).isEqualTo(business.getValue().getRequestId()).isNotEqualTo("forged");
        assertThat(administrative.getValue().getAction()).isEqualTo(AuditAction.SHOP_INACTIVATED);
        assertThat(administrative.getValue().getMetadata()).containsEntry("beforeStatus", "ACTIVE").containsEntry("afterStatus", "INACTIVE");
        assertThat(administrative.getValue().getReason()).isEqualTo("Paused");
    }

    @Test void rejectsIncompleteOrArchivedStatusContextAndReadEventsWithStatusAction() {
        assertThatThrownBy(() -> service.record(42, AdminAccessAction.SHOP_STATUS_UPDATED, 7L, 7L, false, 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.recordShopStatus(42L, 7L, null, ShopStatus.INACTIVE, "Paused"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.recordShopStatus(42L, 7L, ShopStatus.ACTIVE, ShopStatus.INACTIVE, " "))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.recordShopStatus(42L, 7L, ShopStatus.ARCHIVED, ShopStatus.ACTIVE, null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.recordShopStatus(42L, 7L, ShopStatus.ACTIVE, ShopStatus.INACTIVE, "x".repeat(501)))
                .isInstanceOf(IllegalArgumentException.class);
        service.recordShopStatus(42L, 7L, ShopStatus.INACTIVE, ShopStatus.ACTIVE, null);
        verify(repository).append(argThat(event -> event.getAction() == AuditAction.SHOP_REACTIVATED && event.getReason() == null));
    }

    @Test void sharedEntityKeepsBusinessTargetsRequiredAndAdminMetadataRestricted() {
        String id = UUID.randomUUID().toString();
        assertThatThrownBy(() -> AuditLog.success(null, 42L, SystemRole.OWNER, AuditAction.SALE_VOIDED,
                1L, null, id, null, java.util.Map.of())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AuditLog.success(7L, 42L, SystemRole.OWNER, AuditAction.SALE_VOIDED,
                null, null, id, null, java.util.Map.of())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AuditLog.success(null, 42L, SystemRole.OWNER, AuditAction.ADMIN_OVERVIEW_VIEWED,
                null, null, id, null, java.util.Map.of("queryPresent", false, "resultCount", 1))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AuditLog.success(null, 42L, SystemRole.ADMIN, AuditAction.ADMIN_OVERVIEW_VIEWED,
                null, null, id, null, java.util.Map.of("queryPresent", false, "resultCount", 1, "customerPhone", "private")))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> AdminAccessAction.fromAuditAction(AuditAction.SALE_VOIDED)).isInstanceOf(IllegalArgumentException.class);
    }
}
