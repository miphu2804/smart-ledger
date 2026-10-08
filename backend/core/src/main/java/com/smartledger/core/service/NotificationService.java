package com.smartledger.core.service;

import com.smartledger.core.dto.response.NotificationPageResponse;
import com.smartledger.core.enums.NotificationType;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.util.List;

public interface NotificationService {
    NotificationPageResponse list(VerifiedFirebaseToken token, Long shopId, NotificationType type,
            boolean unreadOnly, int page, int size);
    long unreadCount(VerifiedFirebaseToken token, Long shopId, NotificationType type);
    void markRead(VerifiedFirebaseToken token, List<Long> ids);
}
