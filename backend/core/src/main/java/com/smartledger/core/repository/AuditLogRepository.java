package com.smartledger.core.repository;

import com.smartledger.core.entity.AuditLog;
import com.smartledger.core.enums.AuditAction;
import java.time.OffsetDateTime;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface AuditLogRepository extends Repository<AuditLog, Long>, AuditLogAppender {
    default Page<AuditLog> search(Long shopId, AuditAction action, Long entityId,
            OffsetDateTime from, OffsetDateTime to, Pageable pageable) {
        return findWindow(shopId, action, entityId,
                from == null ? OffsetDateTime.parse("0001-01-01T00:00:00Z") : from,
                to == null ? OffsetDateTime.parse("9999-12-31T23:59:59Z") : to, pageable);
    }

    @Query("""
            select a from AuditLog a where a.shopId = :shopId
            and (:action is null or a.action = :action)
            and (:entityId is null or a.entityId = :entityId)
            and a.createdAt >= :from and a.createdAt < :to
            order by a.createdAt desc, a.id desc
            """)
    Page<AuditLog> findWindow(@Param("shopId") Long shopId, @Param("action") AuditAction action,
            @Param("entityId") Long entityId, @Param("from") OffsetDateTime from,
            @Param("to") OffsetDateTime to, Pageable pageable);
}
