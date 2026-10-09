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
import com.smartledger.core.media.MediaStorage;
import com.smartledger.core.exception.ApiErrorDetail;
import com.smartledger.core.dto.response.UserResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.util.StringUtils;
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
    private final MediaStorage storage;
    private final JdbcTemplate jdbc;

    public MediaWriteTransactionService(ProductRepository products, ShopRepository shops, UserAccountRepository users,
            MediaIdempotencyReplay idempotency, MediaCleanupJobService cleanupJobs, AuditLogService audit,
            MediaStorage storage, JdbcTemplate jdbc) {
        this.products = products;
        this.shops = shops;
        this.users = users;
        this.idempotency = idempotency;
        this.cleanupJobs = cleanupJobs;
        this.audit = audit;
        this.storage = storage;
        this.jdbc = jdbc;
    }

    @Transactional
    public ProductResponse saveProductImage(Shop shop, Long productId,
            MediaIdempotencyReplay.Reservation<ProductResponse> reservation,
            StoredMedia stored) {
        Shop lockedShop = lockActiveShop(shop);
        idempotency.lockPending(lockedShop.getId(), lockedShop.getOwnerId(), "PRODUCT_IMAGE_UPLOAD", reservation);
        lockAsset(stored.publicId());
        Product product = products.findLockedByIdAndShopIdAndStatus(productId, lockedShop.getId(), CatalogStatus.ACTIVE)
                .orElseThrow(() -> new BusinessException(ErrorCode.PRODUCT_NOT_FOUND));
        enqueueReplacement(product.getImagePublicId(), stored.publicId(), MediaAssetType.PRODUCT_IMAGE);
        product.replaceCloudinaryImage(stored.secureUrl(), stored.publicId());
        audit.recordOwner(lockedShop, AuditAction.PRODUCT_UPDATED, product.getId(), null, reservation.key(),
                Map.of("changedFields", List.of("imageUrl")));
        products.flush();
        ProductResponse response = productResponse(product);
        idempotency.complete(lockedShop.getId(), lockedShop.getOwnerId(), "PRODUCT_IMAGE_UPLOAD", reservation,
                response);
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
        storage.ensureAvailable();
        enqueueReplacement(product.getImagePublicId(), null, MediaAssetType.PRODUCT_IMAGE);
        product.clearImage();
        audit.recordOwner(lockedShop, AuditAction.PRODUCT_UPDATED, product.getId(), null, null,
                Map.of("changedFields", List.of("imageUrl")));
    }

    @Transactional
    public ShopResponse saveShopLogo(Shop shop, MediaIdempotencyReplay.Reservation<ShopResponse> reservation,
            StoredMedia stored) {
        Shop locked = lockActiveShop(shop);
        idempotency.lockPending(locked.getId(), locked.getOwnerId(), "SHOP_LOGO_UPLOAD", reservation);
        lockAsset(stored.publicId());
        enqueueReplacement(locked.getLogoPublicId(), stored.publicId(), MediaAssetType.SHOP_LOGO);
        locked.replaceCloudinaryLogo(stored.secureUrl(), stored.publicId());
        audit.recordOwner(locked, AuditAction.SHOP_UPDATED, locked.getId(), null, reservation.key(),
                Map.of("changedFields", List.of("logoUrl")));
        shops.flush();
        ShopResponse response = shopResponse(locked);
        idempotency.complete(locked.getId(), locked.getOwnerId(), "SHOP_LOGO_UPLOAD", reservation,
                response);
        return response;
    }

    @Transactional
    public void clearShopLogo(Shop shop) {
        Shop locked = lockActiveShop(shop);
        if (locked.getLogoUrl() == null && locked.getLogoPublicId() == null) {
            return;
        }
        storage.ensureAvailable();
        enqueueReplacement(locked.getLogoPublicId(), null, MediaAssetType.SHOP_LOGO);
        locked.clearLogo();
        audit.recordOwner(locked, AuditAction.SHOP_UPDATED, locked.getId(), null, null,
                Map.of("changedFields", List.of("logoUrl")));
    }

    @Transactional
    public SavedAvatar saveAvatar(UserAccount user, MediaIdempotencyReplay.Reservation<SavedAvatar> reservation,
            StoredMedia stored) {
        UserAccount locked = users.findLockedById(user.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_PROFILE_NOT_FOUND));
        ensureUserIsActive(locked);
        idempotency.lockPending(null, locked.getId(), "USER_AVATAR_UPLOAD", reservation);
        lockAsset(stored.publicId());
        enqueueReplacement(locked.getAvatarPublicId(), stored.publicId(), MediaAssetType.USER_AVATAR);
        locked.replaceCloudinaryAvatar(stored.publicId());
        audit.record(null, locked.getId(), locked.getSystemRole(), AuditAction.USER_AVATAR_UPDATED, locked.getId(),
                null, null, Map.of("changedFields", List.of("avatarUrl")));
        users.flush();
        SavedAvatar response = new SavedAvatar(locked.getId(), locked.getDisplayName(), locked.getEmail(),
                locked.getPhone(), locked.getAvatarPublicId());
        idempotency.complete(null, locked.getId(), "USER_AVATAR_UPLOAD", reservation,
                response);
        return response;
    }

    @Transactional
    public void clearAvatar(UserAccount user) {
        UserAccount locked = users.findLockedById(user.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_PROFILE_NOT_FOUND));
        ensureUserIsActive(locked);
        if (locked.getAvatarPublicId() == null) {
            return;
        }
        storage.ensureAvailable();
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
            throw new BusinessException(ErrorCode.SHOP_INACTIVE,
                    StringUtils.hasText(locked.getInactiveReason())
                            ? List.of(new ApiErrorDetail("inactiveReason", locked.getInactiveReason())) : List.of());
        }
        return locked;
    }

    private void ensureUserIsActive(UserAccount user) {
        if (user.getStatus() == UserStatus.DISABLED) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED);
        }
    }

    private void lockAsset(String publicId) {
        jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", publicId);
    }

    /** Internal replay snapshot; signed delivery URLs are regenerated on every response. */
    public record SavedAvatar(Long id, String displayName, String email, String phone, String publicId) {
        public UserResponse response(MediaStorage storage) {
            return new UserResponse(id, displayName, email, phone, storage.authenticatedUrl(publicId));
        }
    }

    private static ProductResponse productResponse(Product product) {
        return new ProductResponse(product.getId(), product.getShopId(), product.getCategoryId(), product.getName(),
                product.getBarcode(), product.getImageUrl(), product.getUnit(), product.getSellingPriceVnd(),
                product.getCostPriceVnd(), product.isTracked(), product.getStockQuantity(), product.getStatus(),
                product.getCreatedAt(), product.getUpdatedAt(), product.getLowStockThreshold());
    }

    private static ShopResponse shopResponse(Shop shop) {
        return new ShopResponse(shop.getId(), shop.getName(), shop.getIndustry(), shop.getPhone(), shop.getAddress(),
                shop.getLogoUrl(), shop.getStatus(), shop.getInactiveReason(), shop.getArchivedReason());
    }

}
