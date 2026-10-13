package com.smartledger.core.entity;

import com.smartledger.core.enums.NotificationType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "notification_events", uniqueConstraints =
        @UniqueConstraint(name = "uq_notification_event_dedup", columnNames = {"shop_id", "dedup_key"}),
        indexes = @Index(name = "idx_notification_shop_time", columnList = "shop_id,created_at,id"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NotificationEvent {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "shop_id", nullable = false)
    private Long shopId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 50)
    private NotificationType type;
    @Column(nullable = false, length = 255)
    private String title;
    @Column(nullable = false, length = 1000)
    private String body;
    @Column(name = "entity_type", nullable = false, length = 100)
    private String entityType;
    @Column(name = "entity_id", nullable = false)
    private Long entityId;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "data_json", columnDefinition = "jsonb")
    private Map<String, Object> dataJson;
    @Column(name = "dedup_key", nullable = false, length = 255)
    private String dedupKey;
    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    public static NotificationEvent create(Long shopId, NotificationType type, String title, String body,
            String entityType, Long entityId, String dedupKey, Map<String, Object> data) {
        NotificationEvent event = new NotificationEvent();
        event.shopId = shopId;
        event.type = type;
        event.title = title;
        event.body = body;
        event.entityType = entityType;
        event.entityId = entityId;
        event.dedupKey = dedupKey;
        event.dataJson = Map.copyOf(data);
        return event;
    }

    public void resolve(OffsetDateTime time) {
        if (!type.isStockAlert()) throw new IllegalStateException("Only stock alerts have a resolution lifecycle");
        if (resolvedAt == null) resolvedAt = time;
    }

    @PrePersist void onCreate() { createdAt = OffsetDateTime.now(ZoneOffset.UTC); }
}
