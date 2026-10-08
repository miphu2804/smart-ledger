package com.smartledger.core.service.impl;

import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.dto.response.ShopResponse;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.MediaAssetType;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.enums.UserStatus;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.media.StoredMedia;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.repository.ShopRepository;
import com.smartledger.core.repository.UserAccountRepository;
import com.smartledger.core.service.AuditLogService;
import com.smartledger.core.service.MediaCleanupJobService;
import com.smartledger.core.media.MediaIdempotencyReplay;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Transactional half of media writes. Cloudinary calls must happen before reaching this bean. */
@Service
public class MediaWriteTransactionService {
    private final ProductRepository products;
    private final ShopRepository shops;
    private final UserAccountRepository users;
    private final MediaIdempotencyReplay idempotency;
    private final MediaCleanupJobService cleanupJobs;
    private final AuditLogService audit;

    public MediaWriteTransactionService(ProductRepository products, ShopRepository shops, UserAccountRepository users,
            MediaIdempotencyReplay idempotency, MediaCleanupJobService cleanupJobs, AuditLogService audit) {
        this.products = products;
        this.shops = shops;
        this.users = users;
        this.idempotency = idempotency;
        this.cleanupJobs = cleanupJobs;
        this.audit = audit;
    }

    @Transactional
    public ProductResponse saveProductImage(Shop shop, Long productId,
            MediaIdempotencyReplay.Reservation<ProductResponse> reservation,
            StoredMedia stored) {
        Shop lockedShop = lockActiveShop(shop);
        Product product = products.findLockedByIdAndShopIdAndStatus(productId, lockedShop.getId(), CatalogStatus.ACTIVE)
                .orElseThrow(() -> new BusinessException(ErrorCode.PRODUCT_NOT_FOUND));
        enqueueReplacement(product.getImagePublicId(), stored.publicId(), MediaAssetType.PRODUCT_IMAGE);
        product.replaceCloudinaryImage(stored.secureUrl(), stored.publicId());
        audit.recordOwner(lockedShop, AuditAction.PRODUCT_UPDATED, product.getId(), null, reservation.key(),
                Map.of("changedFields", List.of("imageUrl")));
        products.flush();
        ProductResponse response = productResponse(product);
        idempotency.complete(lockedShop.getId(), lockedShop.getOwnerId(), "PRODUCT_IMAGE_UPLOAD", reservation,
                "PRODUCT", ProductResponse::id, 200, response);
        return response;
    }

    @Transactional
    public void clearProductImage(Shop shop, Long productId) {
        Shop lockedShop = lockActiveShop(shop);
        Product product = products.findLockedByIdAndShopIdAndStatus(productId, lockedShop.getId(), CatalogStatus.ACTIVE)
                .orElseThrow(() -> new BusinessException(ErrorCode.PRODUCT_NOT_FOUND));
        if (product.getImageUrl() == null && product.getImagePublicId() == null) {
            return;
        }
        enqueueReplacement(product.getImagePublicId(), null, MediaAssetType.PRODUCT_IMAGE);
        product.clearImage();
        audit.recordOwner(lockedShop, AuditAction.PRODUCT_UPDATED, product.getId(), null, null,
                Map.of("changedFields", List.of("imageUrl")));
    }

    @Transactional
    public ShopResponse saveShopLogo(Shop shop, MediaIdempotencyReplay.Reservation<ShopResponse> reservation,
            StoredMedia stored) {
        Shop locked = lockActiveShop(shop);
        enqueueReplacement(locked.getLogoPublicId(), stored.publicId(), MediaAssetType.SHOP_LOGO);
        locked.replaceCloudinaryLogo(stored.secureUrl(), stored.publicId());
        audit.recordOwner(locked, AuditAction.SHOP_UPDATED, locked.getId(), null, reservation.key(),
                Map.of("changedFields", List.of("logoUrl")));
        shops.flush();
        ShopResponse response = shopResponse(locked);
        idempotency.complete(locked.getId(), locked.getOwnerId(), "SHOP_LOGO_UPLOAD", reservation,
                "SHOP", ShopResponse::id, 200, response);
        return response;
    }

    @Transactional
    public void clearShopLogo(Shop shop) {
        Shop locked = lockActiveShop(shop);
        if (locked.getLogoUrl() == null && locked.getLogoPublicId() == null) {
            return;
        }
        enqueueReplacement(locked.getLogoPublicId(), null, MediaAssetType.SHOP_LOGO);
        locked.clearLogo();
        audit.recordOwner(locked, AuditAction.SHOP_UPDATED, locked.getId(), null, null,
                Map.of("changedFields", List.of("logoUrl")));
    }

    @Transactional
    public String saveAvatar(UserAccount user, StoredMedia stored) {
        UserAccount locked = users.findLockedById(user.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_PROFILE_NOT_FOUND));
        ensureUserIsActive(locked);
        enqueueReplacement(locked.getAvatarPublicId(), stored.publicId(), MediaAssetType.USER_AVATAR);
        locked.replaceCloudinaryAvatar(stored.publicId());
        audit.record(null, locked.getId(), locked.getSystemRole(), AuditAction.USER_AVATAR_UPDATED, locked.getId(),
                null, null, Map.of("changedFields", List.of("avatarUrl")));
        users.flush();
        return locked.getAvatarPublicId();
    }

    @Transactional
    public void clearAvatar(UserAccount user) {
        UserAccount locked = users.findLockedById(user.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_PROFILE_NOT_FOUND));
        ensureUserIsActive(locked);
        if (locked.getAvatarUrl() == null && locked.getAvatarPublicId() == null) {
            return;
        }
        enqueueReplacement(locked.getAvatarPublicId(), null, MediaAssetType.USER_AVATAR);
        locked.clearCloudinaryAvatar();
        audit.record(null, locked.getId(), locked.getSystemRole(), AuditAction.USER_AVATAR_UPDATED, locked.getId(),
                null, null, Map.of("changedFields", List.of("avatarUrl")));
    }

    private void enqueueReplacement(String oldPublicId, String newPublicId, MediaAssetType assetType) {
        if (oldPublicId != null && !oldPublicId.equals(newPublicId)) {
            cleanupJobs.enqueue(oldPublicId, assetType);
        }
    }

    private Shop lockActiveShop(Shop shop) {
        Shop locked = shops.findLockedByIdAndOwnerId(shop.getId(), shop.getOwnerId())
                .orElseThrow(() -> new BusinessException(ErrorCode.SHOP_ACCESS_DENIED));
        if (locked.getStatus() == ShopStatus.ARCHIVED) {
            throw new BusinessException(ErrorCode.SHOP_NOT_FOUND);
        }
        if (locked.getStatus() == ShopStatus.INACTIVE) {
            throw new BusinessException(ErrorCode.SHOP_INACTIVE);
        }
        return locked;
    }

    private void ensureUserIsActive(UserAccount user) {
        if (user.getStatus() == UserStatus.DISABLED) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED);
        }
    }

    private static ProductResponse productResponse(Product product) {
        return new ProductResponse(product.getId(), product.getShopId(), product.getCategoryId(), product.getName(),
                product.getBarcode(), product.getImageUrl(), product.getUnit(), product.getSellingPriceVnd(),
                product.getCostPriceVnd(), product.isTracked(), product.getStockQuantity(), product.getStatus(),
                product.getCreatedAt(), product.getUpdatedAt());
    }

    private static ShopResponse shopResponse(Shop shop) {
        return new ShopResponse(shop.getId(), shop.getName(), shop.getIndustry(), shop.getPhone(), shop.getAddress(),
                shop.getLogoUrl(), shop.getStatus(), shop.getInactiveReason(), shop.getArchivedReason());
    }

}
