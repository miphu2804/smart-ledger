package com.smartledger.core.service.impl;

import com.smartledger.core.dto.request.ArchiveShopRequest;
import com.smartledger.core.dto.request.ShopCreateRequest;
import com.smartledger.core.dto.request.ShopStatusUpdateRequest;
import com.smartledger.core.dto.request.ShopUpdateRequest;
import com.smartledger.core.dto.response.ShopResponse;
import com.smartledger.core.entity.AuthIdentity;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.enums.SystemRole;
import com.smartledger.core.enums.UserStatus;
import com.smartledger.core.exception.ApiErrorDetail;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.AuthIdentityRepository;
import com.smartledger.core.repository.ShopRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ShopService;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class ShopServiceImpl implements ShopService {

    private final AuthIdentityRepository authIdentityRepository;
    private final ShopRepository shopRepository;

    public ShopServiceImpl(AuthIdentityRepository authIdentityRepository, ShopRepository shopRepository) {
        this.authIdentityRepository = authIdentityRepository;
        this.shopRepository = shopRepository;
    }

    @Override
    @Transactional
    public ShopResponse create(VerifiedFirebaseToken firebaseToken, ShopCreateRequest request) {
        UserAccount owner = requireActiveOwner(firebaseToken);
        Shop shop = Shop.create(
                owner.getId(),
                request.name().trim(),
                request.industry().trim(),
                normalizeOptional(request.phone()),
                normalizeOptional(request.address()));
        return toResponse(shopRepository.save(shop));
    }

    @Override
    @Transactional(readOnly = true)
    public ShopResponse getById(VerifiedFirebaseToken firebaseToken, String shopId) {
        return toResponse(requireOwnedVisibleShop(firebaseToken, shopId, "shopId"));
    }

    @Override
    @Transactional
    public ShopResponse updateById(
            VerifiedFirebaseToken firebaseToken,
            String shopId,
            ShopUpdateRequest request) {
        if (!request.hasChanges()) {
            throw new BusinessException(ErrorCode.SHOP_UPDATE_REQUIRED);
        }
        Shop shop = requireOwnedVisibleShop(firebaseToken, shopId, "shopId");
        ensureShopIsActive(shop);
        shop.update(
                request.name() == null ? shop.getName() : normalizeRequired(request.name()),
                request.industry() == null ? shop.getIndustry() : normalizeRequired(request.industry()),
                request.phone() == null ? shop.getPhone() : normalizeOptional(request.phone()),
                request.address() == null ? shop.getAddress() : normalizeOptional(request.address()));
        return toResponse(shop);
    }

    @Override
    @Transactional
    public void archiveById(
            VerifiedFirebaseToken firebaseToken,
            String shopId,
            ArchiveShopRequest request) {
        Shop shop = requireOwnedVisibleShop(firebaseToken, shopId, "shopId");
        shop.archive(normalizeRequired(request.archivedReason()));
    }

    @Override
    @Transactional
    public ShopResponse updateStatus(
            VerifiedFirebaseToken firebaseToken,
            String shopId,
            ShopStatusUpdateRequest request) {
        requireActiveAdmin(firebaseToken);
        Shop shop = shopRepository.findById(parseShopId(shopId, "shopId"))
                .orElseThrow(() -> new BusinessException(ErrorCode.SHOP_NOT_FOUND));
        if (shop.getStatus() == ShopStatus.ARCHIVED) {
            throw new BusinessException(ErrorCode.SHOP_NOT_FOUND);
        }

        if (request.status() == ShopStatus.INACTIVE) {
            shop.deactivate(normalizeInactiveReason(request.inactiveReason()));
        } else if (request.status() == ShopStatus.ACTIVE) {
            shop.activate();
        } else {
            throw new BusinessException(ErrorCode.SHOP_STATUS_CHANGE_INVALID);
        }
        return toResponse(shop);
    }

    @Override
    @Transactional(readOnly = true)
    public Shop requireOwnedActiveShop(VerifiedFirebaseToken firebaseToken, String shopIdHeader) {
        Shop shop = requireOwnedVisibleShop(firebaseToken, shopIdHeader, "X-Shop-Id");
        ensureShopIsActive(shop);
        return shop;
    }

    private Shop requireOwnedShop(VerifiedFirebaseToken firebaseToken, String shopIdValue, String fieldName) {
        UserAccount owner = requireActiveOwner(firebaseToken);
        Long shopId = parseShopId(shopIdValue, fieldName);
        return shopRepository.findByIdAndOwnerId(shopId, owner.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.SHOP_ACCESS_DENIED));
    }

    private Shop requireOwnedVisibleShop(
            VerifiedFirebaseToken firebaseToken,
            String shopIdValue,
            String fieldName) {
        Shop shop = requireOwnedShop(firebaseToken, shopIdValue, fieldName);
        if (shop.getStatus() == ShopStatus.ARCHIVED) {
            throw new BusinessException(ErrorCode.SHOP_NOT_FOUND);
        }
        return shop;
    }

    private UserAccount requireActiveOwner(VerifiedFirebaseToken firebaseToken) {
        UserAccount user = requireActiveUser(firebaseToken);
        if (user.getSystemRole() != SystemRole.OWNER) {
            throw new BusinessException(ErrorCode.SHOP_ACCESS_DENIED);
        }
        return user;
    }

    private void requireActiveAdmin(VerifiedFirebaseToken firebaseToken) {
        if (requireActiveUser(firebaseToken).getSystemRole() != SystemRole.ADMIN) {
            throw new BusinessException(ErrorCode.ADMIN_ACCESS_REQUIRED);
        }
    }

    private UserAccount requireActiveUser(VerifiedFirebaseToken firebaseToken) {
        UserAccount user = authIdentityRepository.findWithUserByProviderSubject(firebaseToken.uid())
                .map(AuthIdentity::getUser)
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_PROFILE_NOT_FOUND));
        if (user.getStatus() == UserStatus.DISABLED) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED);
        }
        return user;
    }

    private Long parseShopId(String shopIdValue, String fieldName) {
        if (!StringUtils.hasText(shopIdValue)) {
            throw invalidShopId(fieldName);
        }
        try {
            long shopId = Long.parseLong(shopIdValue);
            if (shopId <= 0) {
                throw invalidShopId(fieldName);
            }
            return shopId;
        } catch (NumberFormatException exception) {
            throw invalidShopId(fieldName);
        }
    }

    private String normalizeRequired(String value) {
        if (!StringUtils.hasText(value)) {
            throw new BusinessException(ErrorCode.SHOP_UPDATE_REQUIRED);
        }
        return value.trim();
    }

    private String normalizeOptional(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private String normalizeInactiveReason(String reason) {
        if (!StringUtils.hasText(reason)) {
            throw new BusinessException(ErrorCode.SHOP_INACTIVE_REASON_REQUIRED);
        }
        return reason.trim();
    }

    private void ensureShopIsActive(Shop shop) {
        if (shop.getStatus() == ShopStatus.INACTIVE) {
            List<ApiErrorDetail> details = StringUtils.hasText(shop.getInactiveReason())
                    ? List.of(new ApiErrorDetail("inactiveReason", shop.getInactiveReason()))
                    : List.of();
            throw new BusinessException(ErrorCode.SHOP_INACTIVE, details);
        }
    }

    private BusinessException invalidShopId(String fieldName) {
        return new BusinessException(
                ErrorCode.INVALID_SHOP_ID,
                List.of(new ApiErrorDetail(fieldName, "must be a positive integer")));
    }

    private ShopResponse toResponse(Shop shop) {
        return new ShopResponse(
                shop.getId(),
                shop.getName(),
                shop.getIndustry(),
                shop.getPhone(),
                shop.getAddress(),
                shop.getStatus(),
                shop.getInactiveReason(),
                shop.getArchivedReason());
    }
}
