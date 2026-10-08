package com.smartledger.core.service.impl;

import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.dto.response.ShopResponse;
import com.smartledger.core.dto.response.UserResponse;
import com.smartledger.core.entity.AuthIdentity;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.entity.UserAccount;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.enums.MediaAssetType;
import com.smartledger.core.enums.UserStatus;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.media.MediaPublicIdFactory;
import com.smartledger.core.media.MediaIdempotencyReplay;
import com.smartledger.core.media.MediaStorage;
import com.smartledger.core.media.MediaUpload;
import com.smartledger.core.media.MediaDeliveryType;
import com.smartledger.core.media.MediaUploadRequest;
import com.smartledger.core.media.MultipartImageReader;
import com.smartledger.core.media.StoredMedia;
import com.smartledger.core.media.ValidatedImage;
import com.smartledger.core.repository.AuthIdentityRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.MediaService;
import com.smartledger.core.service.ShopService;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/** Non-transactional orchestration. Remote upload is intentionally completed before the DB transaction starts. */
@Service
public class MediaServiceImpl implements MediaService {
    private final ShopService shops;
    private final ProductRepository products;
    private final AuthIdentityRepository identities;
    private final MultipartImageReader images;
    private final MediaPublicIdFactory publicIds;
    private final MediaStorage storage;
    private final MediaIdempotencyReplay replay;
    private final MediaWriteTransactionService writes;

    public MediaServiceImpl(ShopService shops, ProductRepository products, AuthIdentityRepository identities,
            MultipartImageReader images, MediaPublicIdFactory publicIds, MediaStorage storage,
            MediaIdempotencyReplay replay, MediaWriteTransactionService writes) {
        this.shops = shops;
        this.products = products;
        this.identities = identities;
        this.images = images;
        this.publicIds = publicIds;
        this.storage = storage;
        this.replay = replay;
        this.writes = writes;
    }

    @Override
    public ProductResponse uploadProductImage(VerifiedFirebaseToken token, String shopId, String productId,
            String idempotencyKey, MultipartFile image) {
        Shop shop = shops.requireOwnedActiveShop(token, shopId);
        Product product = activeProduct(shop.getId(), productId);
        ValidatedImage imageData = images.read(image);
        String publicId = publicIds.create(MediaAssetType.PRODUCT_IMAGE, shop.getId(), product.getId(), idempotencyKey,
                imageData.sha256());
        MediaUploadRequest request = new MediaUploadRequest(publicId, imageData.sha256());
        var reservation = replay.reserve(shop.getId(), shop.getOwnerId(), "PRODUCT_IMAGE_UPLOAD", idempotencyKey,
                request, ProductResponse.class);
        if (reservation.isReplay()) {
            return reservation.replay();
        }
        try {
            StoredMedia uploaded = store(publicId, imageData, MediaDeliveryType.PUBLIC);
            return writes.saveProductImage(shop, product.getId(), reservation, uploaded);
        } catch (RuntimeException exception) {
            replay.release(shop.getId(), shop.getOwnerId(), "PRODUCT_IMAGE_UPLOAD", reservation);
            throw exception;
        }
    }

    @Override
    public void deleteProductImage(VerifiedFirebaseToken token, String shopId, String productId) {
        Shop shop = shops.requireOwnedActiveShop(token, shopId);
        writes.clearProductImage(shop, activeProduct(shop.getId(), productId).getId());
    }

    @Override
    public ShopResponse uploadShopLogo(VerifiedFirebaseToken token, String shopId, String idempotencyKey,
            MultipartFile image) {
        Shop shop = shops.requireOwnedActiveShop(token, shopId);
        ValidatedImage imageData = images.read(image);
        String publicId = publicIds.create(MediaAssetType.SHOP_LOGO, shop.getId(), shop.getId(), idempotencyKey,
                imageData.sha256());
        MediaUploadRequest request = new MediaUploadRequest(publicId, imageData.sha256());
        var reservation = replay.reserve(shop.getId(), shop.getOwnerId(), "SHOP_LOGO_UPLOAD", idempotencyKey,
                request, ShopResponse.class);
        if (reservation.isReplay()) {
            return reservation.replay();
        }
        try {
            StoredMedia uploaded = store(publicId, imageData, MediaDeliveryType.PUBLIC);
            return writes.saveShopLogo(shop, reservation, uploaded);
        } catch (RuntimeException exception) {
            replay.release(shop.getId(), shop.getOwnerId(), "SHOP_LOGO_UPLOAD", reservation);
            throw exception;
        }
    }

    @Override
    public void deleteShopLogo(VerifiedFirebaseToken token, String shopId) {
        writes.clearShopLogo(shops.requireOwnedActiveShop(token, shopId));
    }

    @Override
    public UserResponse uploadAvatar(VerifiedFirebaseToken token, MultipartFile image) {
        UserAccount user = activeUser(token);
        ValidatedImage validated = images.read(image);
        String publicId = publicIds.createAvatar(user.getId(), validated.sha256());
        StoredMedia uploaded = store(publicId, validated, MediaDeliveryType.AUTHENTICATED);
        String storedPublicId = writes.saveAvatar(user, uploaded);
        return new UserResponse(user.getId(), user.getDisplayName(), user.getEmail(), user.getPhone(),
                storage.authenticatedUrl(storedPublicId));
    }

    @Override
    public void deleteAvatar(VerifiedFirebaseToken token) {
        writes.clearAvatar(activeUser(token));
    }

    private StoredMedia store(String publicId, ValidatedImage validated, MediaDeliveryType deliveryType) {
        return storage.upload(new MediaUpload(publicId, validated.contentType(), validated.bytes(), deliveryType));
    }

    private Product activeProduct(Long shopId, String value) {
        try {
            Long id = Long.valueOf(value);
            if (id > 0) {
                return products.findByIdAndShopIdAndStatus(id, shopId, CatalogStatus.ACTIVE)
                        .orElseThrow(() -> new BusinessException(ErrorCode.PRODUCT_NOT_FOUND));
            }
        } catch (NumberFormatException ignored) { }
        throw new BusinessException(ErrorCode.INVALID_PRODUCT_ID);
    }

    private UserAccount activeUser(VerifiedFirebaseToken token) {
        UserAccount user = identities.findWithUserByProviderSubject(token.uid()).map(AuthIdentity::getUser)
                .orElseThrow(() -> new BusinessException(ErrorCode.AUTH_PROFILE_NOT_FOUND));
        if (user.getStatus() == UserStatus.DISABLED) {
            throw new BusinessException(ErrorCode.ACCOUNT_DISABLED);
        }
        return user;
    }

}
