package com.smartledger.core.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "notification_recipients", uniqueConstraints =
        @UniqueConstraint(name = "uq_notification_recipient", columnNames = {"notification_event_id", "user_id"}),
        indexes = {@Index(name = "idx_notification_recipient_time", columnList = "user_id,created_at,id"),
                @Index(name = "idx_notification_recipient_read", columnList = "user_id,read_at")})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class NotificationRecipient {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "notification_event_id", nullable = false)
    private NotificationEvent event;
    @Column(name = "user_id", nullable = false)
    private Long userId;
    @Column(name = "read_at")
    private OffsetDateTime readAt;
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    public static NotificationRecipient forOwner(NotificationEvent event, Long userId) {
        NotificationRecipient recipient = new NotificationRecipient();
        recipient.event = event;
        recipient.userId = userId;
        return recipient;
    }

    @PrePersist void onCreate() { createdAt = OffsetDateTime.now(ZoneOffset.UTC); }
}
