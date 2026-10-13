package com.smartledger.core.repository;

import com.smartledger.core.entity.NotificationRecipient;
import com.smartledger.core.enums.NotificationType;
import jakarta.persistence.LockModeType;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRecipientRepository extends JpaRepository<NotificationRecipient, Long> {
    // INACTIVE shops disclose status messages only, never historical money/stock content.
    String VISIBLE = """
            r.userId = :userId and s.ownerId = :userId
            and (s.status = com.smartledger.core.enums.ShopStatus.ACTIVE
                 or (s.status = com.smartledger.core.enums.ShopStatus.INACTIVE
                     and e.type in (com.smartledger.core.enums.NotificationType.SHOP_INACTIVATED,
                                    com.smartledger.core.enums.NotificationType.SHOP_REACTIVATED)))
            and (:shopId is null or e.shopId = :shopId)
            and (:type is null or e.type = :type)
            """;

    @Query(value = "select r from NotificationRecipient r join fetch r.event e join Shop s on s.id = e.shopId where "
            + VISIBLE + " and (:unreadOnly = false or r.readAt is null) order by e.createdAt desc, e.id desc",
            countQuery = "select count(r) from NotificationRecipient r join r.event e join Shop s on s.id = e.shopId where "
                    + VISIBLE + " and (:unreadOnly = false or r.readAt is null)")
    Page<NotificationRecipient> search(@Param("userId") Long userId, @Param("shopId") Long shopId,
            @Param("type") NotificationType type, @Param("unreadOnly") boolean unreadOnly, Pageable pageable);

    @Query("select count(r) from NotificationRecipient r join r.event e join Shop s on s.id = e.shopId where "
            + VISIBLE + " and r.readAt is null")
    long countUnread(@Param("userId") Long userId, @Param("shopId") Long shopId,
            @Param("type") NotificationType type);

    @Query("select e.id from NotificationRecipient r join r.event e join Shop s on s.id = e.shopId where "
            + VISIBLE + " and e.id in :ids")
    List<Long> visibleIds(@Param("userId") Long userId, @Param("shopId") Long shopId,
            @Param("type") NotificationType type, @Param("ids") List<Long> ids);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from NotificationRecipient r where r.userId = :userId and r.event.id in :ids order by r.id")
    List<NotificationRecipient> lockForRead(@Param("userId") Long userId, @Param("ids") List<Long> ids);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update NotificationRecipient r set r.readAt = :time where r.userId = :userId "
            + "and r.event.id in :ids and r.readAt is null")
    int markRead(@Param("userId") Long userId, @Param("ids") List<Long> ids,
            @Param("time") OffsetDateTime time);
}
