package com.smartledger.core.service.impl;

import com.smartledger.core.entity.AuditLog;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.enums.SystemRole;
import com.smartledger.core.repository.AuditLogRepository;
import com.smartledger.core.service.AuditLogService;
import com.smartledger.core.service.AuditRequestContext;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class AuditLogServiceImpl implements AuditLogService {
    private final AuditLogRepository repository;

    public AuditLogServiceImpl(AuditLogRepository repository) { this.repository = repository; }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordOwner(Shop shop, AuditAction action, Long entityId, String reason,
            String key, Map<String, Object> metadata) {
        record(shop.getId(), shop.getOwnerId(), SystemRole.OWNER, action, entityId, reason, key, metadata);
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void record(Long shopId, Long actorId, SystemRole actorRole, AuditAction action,
            Long entityId, String reason, String key, Map<String, Object> metadata) {
        if (TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            throw new IllegalStateException("Success audit cannot be written in a read-only transaction");
        }
        repository.append(AuditLog.success(shopId, actorId, actorRole, action,
                entityId, reason, AuditRequestContext.requestId(), key, metadata));
    }
}
