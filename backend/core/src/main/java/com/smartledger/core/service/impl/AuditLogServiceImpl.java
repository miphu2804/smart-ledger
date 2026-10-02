package com.smartledger.core.service.impl;

import com.smartledger.core.entity.AuditLog;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.enums.SystemRole;
import com.smartledger.core.repository.AuditLogRepository;
import com.smartledger.core.service.AuditLogService;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Service
public class AuditLogServiceImpl implements AuditLogService {
    private static final String REQUEST_ID = AuditLogServiceImpl.class.getName() + ".requestId";
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
                entityId, reason, requestId(), key, metadata));
    }

    private String requestId() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) {
            var request = attributes.getRequest();
            if (request.getAttribute(REQUEST_ID) instanceof String id) { return id; }
            String id = UUID.randomUUID().toString();
            request.setAttribute(REQUEST_ID, id);
            return id;
        }
        // Non-HTTP jobs still group all events from one business transaction.
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            if (TransactionSynchronizationManager.getResource(REQUEST_ID) instanceof String id) { return id; }
            String id = UUID.randomUUID().toString();
            TransactionSynchronizationManager.bindResource(REQUEST_ID, id);
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    TransactionSynchronizationManager.unbindResourceIfPossible(REQUEST_ID);
                }
            });
            return id;
        }
        return UUID.randomUUID().toString();
    }
}
