package com.smartledger.core.service;

import com.smartledger.core.entity.AuditLog;
import com.smartledger.core.enums.AdminAccessAction;
import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.enums.SystemRole;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.AuditLogRepository;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class AdminAccessAuditService {
    private static final Logger log = LoggerFactory.getLogger(AdminAccessAuditService.class);
    private final AuditLogRepository repository;
    public AdminAccessAuditService(AuditLogRepository repository) { this.repository = repository; }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(long actorId, AdminAccessAction action, Long targetId, Long shopId, boolean queryPresent, int count) {
        if (action == null || action == AdminAccessAction.SHOP_STATUS_UPDATED) {
            throw new IllegalArgumentException("A read cannot record a shop status change");
        }
        append(AuditLog.success(shopId, actorId, SystemRole.ADMIN, action.auditActions().getFirst(), targetId,
                null, AuditRequestContext.requestId(), null, Map.of("queryPresent", queryPresent, "resultCount", count)));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void recordShopStatus(Long actorId, Long shopId, ShopStatus before, ShopStatus after, String reason) {
        if (before == null || after == null || before == ShopStatus.ARCHIVED || after == ShopStatus.ARCHIVED
                || after == ShopStatus.INACTIVE && (reason == null || reason.isBlank())) {
            throw new IllegalArgumentException("Invalid administrative status change");
        }
        append(AuditLog.success(shopId, actorId, SystemRole.ADMIN,
                after == ShopStatus.INACTIVE ? AuditAction.SHOP_INACTIVATED : AuditAction.SHOP_REACTIVATED,
                shopId, reason, AuditRequestContext.requestId(), null, Map.of("beforeStatus", before, "afterStatus", after)));
    }

    private void append(AuditLog event) {
        if (TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            throw new IllegalStateException("Admin access audit requires a writable transaction");
        }
        try {
            repository.append(event);
        } catch (DataAccessException unavailable) {
            // No best-effort logging: rollback and do not disclose protected data when audit persistence fails.
            log.warn("Administrative audit unavailable actorId={} action={} failure={}",
                    event.getActorUserId(), event.getAction(), unavailable.getClass().getSimpleName());
            throw new BusinessException(ErrorCode.ADMIN_AUDIT_UNAVAILABLE);
        }
    }

}
