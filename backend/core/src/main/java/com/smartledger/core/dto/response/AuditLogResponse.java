package com.smartledger.core.dto.response;

import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.enums.SystemRole;
import java.time.OffsetDateTime;
import java.util.Map;

public record AuditLogResponse(Long id, Long shopId, Long actorUserId, SystemRole actorRole,
        AuditAction action, String entityType, Long entityId, String outcome, String reason,
        String requestId, String idempotencyKey, Map<String, Object> metadata, OffsetDateTime createdAt) { }
