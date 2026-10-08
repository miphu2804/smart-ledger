package com.smartledger.core.repository;

import com.smartledger.core.entity.NotificationEvent;
import com.smartledger.core.enums.NotificationType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationEventRepository extends JpaRepository<NotificationEvent, Long> {
    boolean existsByShopIdAndDedupKey(Long shopId, String dedupKey);
    List<NotificationEvent> findAllByShopIdAndEntityTypeAndEntityIdAndTypeInAndResolvedAtIsNull(
            Long shopId, String entityType, Long entityId, List<NotificationType> types);
    Optional<NotificationEvent> findFirstByShopIdAndEntityTypeAndEntityIdOrderByIdDesc(
            Long shopId, String entityType, Long entityId);
}
