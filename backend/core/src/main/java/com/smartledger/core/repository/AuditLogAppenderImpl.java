package com.smartledger.core.repository;

import com.smartledger.core.entity.AuditLog;
import jakarta.persistence.EntityManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** No merge, update or delete path is exposed by the audit repository. */
public class AuditLogAppenderImpl implements AuditLogAppender {
    private final EntityManager entityManager;

    public AuditLogAppenderImpl(EntityManager entityManager) { this.entityManager = entityManager; }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void append(AuditLog event) {
        if (event.getId() != null) { throw new IllegalArgumentException("An audit event cannot be rewritten"); }
        entityManager.persist(event);
    }
}
