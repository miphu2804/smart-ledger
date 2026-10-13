package com.smartledger.core.service.impl;

import com.smartledger.core.dto.response.NotificationPageResponse;
import com.smartledger.core.dto.response.NotificationResponse;
import com.smartledger.core.entity.AuthIdentity;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.NotificationType;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.enums.SystemRole;
import com.smartledger.core.enums.UserStatus;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.AuthIdentityRepository;
import com.smartledger.core.repository.NotificationRecipientRepository;
import com.smartledger.core.repository.ShopRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.NotificationService;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public class NotificationServiceImpl implements NotificationService {
    private final NotificationRecipientRepository recipients;
    private final AuthIdentityRepository identities;
    private final ShopRepository shops;

    public NotificationServiceImpl(NotificationRecipientRepository recipients, AuthIdentityRepository identities,
            ShopRepository shops) {
        this.recipients = recipients;
        this.identities = identities;
        this.shops = shops;
    }

    @Override
    public NotificationPageResponse list(VerifiedFirebaseToken token, Long shopId, NotificationType type,
            boolean unreadOnly, int page, int size) {
        UserAccount owner = requireOwner(token);
        if (page < 0 || size < 1 || size > 100 || (long) page * size > Integer.MAX_VALUE) {
            throw new BusinessException(ErrorCode.INVALID_NOTIFICATION_QUERY);
        }
        checkShop(owner, shopId);
        var result = recipients.search(owner.getId(), shopId, type, unreadOnly, PageRequest.of(page, size));
        return new NotificationPageResponse(result.getContent().stream().map(recipient -> {
            var event = recipient.getEvent();
            return new NotificationResponse(event.getId(), event.getShopId(), event.getType(), event.getTitle(),
                    event.getBody(), event.getEntityType(), event.getEntityId(), event.getCreatedAt(),
                    recipient.getReadAt(), event.getResolvedAt());
        }).toList(), page, size, result.getTotalElements(), result.getTotalPages());
    }

    @Override
    public long unreadCount(VerifiedFirebaseToken token, Long shopId, NotificationType type) {
        UserAccount owner = requireOwner(token);
        checkShop(owner, shopId);
        return recipients.countUnread(owner.getId(), shopId, type);
    }

    @Override
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void markRead(VerifiedFirebaseToken token, List<Long> ids) {
        UserAccount owner = requireOwner(token);
        if (ids == null || ids.isEmpty() || ids.size() > 100 || ids.stream().anyMatch(id -> id == null || id <= 0)) {
            throw new BusinessException(ErrorCode.INVALID_NOTIFICATION_QUERY);
        }
        List<Long> unique = ids.stream().distinct().sorted().toList();
        // Lock recipient rows in a consistent order so overlapping device retries preserve the first readAt.
        if (recipients.lockForRead(owner.getId(), unique).size() != unique.size()
                || recipients.visibleIds(owner.getId(), null, null, unique).size() != unique.size()) {
            // Do not reveal whether an inaccessible event belongs to a different user or shop.
            throw new BusinessException(ErrorCode.NOTIFICATION_NOT_FOUND);
        }
        recipients.markRead(owner.getId(), unique, OffsetDateTime.now(ZoneOffset.UTC));
    }

    private UserAccount requireOwner(VerifiedFirebaseToken token) {
        UserAccount owner = identities.findWithUserByProviderSubject(token.uid()).map(AuthIdentity::getUser)
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_PROFILE_NOT_FOUND));
        if (owner.getStatus() != UserStatus.ACTIVE) throw new BusinessException(ErrorCode.ACCOUNT_DISABLED);
        if (owner.getSystemRole() != SystemRole.OWNER) throw new BusinessException(ErrorCode.SHOP_ACCESS_DENIED);
        return owner;
    }

    private void checkShop(UserAccount owner, Long shopId) {
        if (shopId == null) return;
        if (shopId <= 0) throw new BusinessException(ErrorCode.INVALID_SHOP_ID);
        var shop = shops.findByIdAndOwnerId(shopId, owner.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.SHOP_ACCESS_DENIED));
        if (shop.getStatus() == ShopStatus.ARCHIVED) throw new BusinessException(ErrorCode.SHOP_NOT_FOUND);
    }
}
