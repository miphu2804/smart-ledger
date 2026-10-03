package com.smartledger.core.service;

import com.smartledger.core.dto.response.AuditLogPageResponse;
import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.time.OffsetDateTime;

public interface AuditLogQueryService {
    AuditLogPageResponse list(VerifiedFirebaseToken token, String shopId, AuditAction action,
            Long entityId, OffsetDateTime from, OffsetDateTime to, int page, int size);
}
