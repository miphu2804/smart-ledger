package com.smartledger.core.repository;

import com.smartledger.core.entity.AuditLog;

public interface AuditLogAppender {
    void append(AuditLog event);
}
