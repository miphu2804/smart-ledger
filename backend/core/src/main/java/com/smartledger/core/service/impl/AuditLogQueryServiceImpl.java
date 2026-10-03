package com.smartledger.core.service.impl;

import com.smartledger.core.dto.response.AuditLogPageResponse;
import com.smartledger.core.dto.response.AuditLogResponse;
import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.AuditLogRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AuditLogQueryService;
import com.smartledger.core.service.ShopService;
import java.time.OffsetDateTime;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuditLogQueryServiceImpl implements AuditLogQueryService {
    private final AuditLogRepository repository;
    private final ShopService shops;

    public AuditLogQueryServiceImpl(AuditLogRepository repository, ShopService shops) {
        this.repository = repository;
        this.shops = shops;
    }

    @Override
    @Transactional(readOnly = true)
    public AuditLogPageResponse list(VerifiedFirebaseToken token, String shopId, AuditAction action,
            Long entityId, OffsetDateTime from, OffsetDateTime to, int page, int size) {
        if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE
                || entityId != null && entityId <= 0 || from != null && to != null && !from.isBefore(to)) {
            throw new BusinessException(ErrorCode.INVALID_AUDIT_QUERY);
        }
        var shop = shops.requireOwnedActiveShop(token, shopId);
        var result = repository.search(shop.getId(), action, entityId, from, to, PageRequest.of(page, size));
        var content = result.getContent().stream().map(a -> new AuditLogResponse(a.getId(), a.getShopId(),
                a.getActorUserId(), a.getActorRole(), a.getAction(), a.getEntityType(), a.getEntityId(),
                a.getOutcome(), a.getReason(), a.getRequestId(), a.getIdempotencyKey(), a.getMetadata(), a.getCreatedAt())).toList();
        return new AuditLogPageResponse(content, page, size, result.getTotalElements(), result.getTotalPages());
    }
}
