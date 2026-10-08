package com.smartledger.core.service;

import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.dto.response.ShopResponse;
import com.smartledger.core.dto.response.UserResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import org.springframework.web.multipart.MultipartFile;

public interface MediaService {
    ProductResponse uploadProductImage(VerifiedFirebaseToken token, String shopId, String productId,
            String idempotencyKey, MultipartFile image);
    void deleteProductImage(VerifiedFirebaseToken token, String shopId, String productId);
    ShopResponse uploadShopLogo(VerifiedFirebaseToken token, String shopId, String idempotencyKey,
            MultipartFile image);
    void deleteShopLogo(VerifiedFirebaseToken token, String shopId);
    UserResponse uploadAvatar(VerifiedFirebaseToken token, String idempotencyKey, MultipartFile image);
    void deleteAvatar(VerifiedFirebaseToken token);
}
