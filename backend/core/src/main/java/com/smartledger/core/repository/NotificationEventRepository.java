package com.smartledger.core.repository;

import com.smartledger.core.entity.NotificationEvent;
import com.smartledger.core.enums.NotificationType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationEventRepository extends JpaRepository<NotificationEvent, Long> {
    boolean existsByShopIdAndDedupKey(Long shopId, String dedupKey);
    /**
     * Reads unresolved alerts for one shop/entity group in one query, without acquiring Product locks.
     * Reconciliation supplies a nonempty ID group and already holds the source Product locks.
     */
    List<NotificationEvent> findAllByShopIdAndEntityTypeAndEntityIdInAndTypeInAndResolvedAtIsNull(
            Long shopId, String entityType, List<Long> entityIds, List<NotificationType> types);
    Optional<NotificationEvent> findFirstByShopIdAndEntityTypeAndEntityIdOrderByIdDesc(
            Long shopId, String entityType, Long entityId);
}
