package com.smartledger.core.dto.response;

import com.smartledger.core.enums.NotificationType;
import java.time.OffsetDateTime;

/** Event ID is the public ID; internal dedup keys and raw metadata are never exposed. */
public record NotificationResponse(Long id, Long shopId, NotificationType type, String title, String body,
        String targetType, Long targetId, OffsetDateTime createdAt, OffsetDateTime readAt, OffsetDateTime resolvedAt) { }
