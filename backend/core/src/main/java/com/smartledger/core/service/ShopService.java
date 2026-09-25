package com.smartledger.core.service;

import com.smartledger.core.dto.request.ArchiveShopRequest;
import com.smartledger.core.dto.request.ShopCreateRequest;
import com.smartledger.core.dto.request.ShopStatusUpdateRequest;
import com.smartledger.core.dto.request.ShopUpdateRequest;
import com.smartledger.core.dto.response.ShopResponse;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.security.VerifiedFirebaseToken;

public interface ShopService {

    ShopResponse create(VerifiedFirebaseToken firebaseToken, ShopCreateRequest request);

    ShopResponse getById(VerifiedFirebaseToken firebaseToken, String shopId);

    ShopResponse updateById(
            VerifiedFirebaseToken firebaseToken,
            String shopId,
            ShopUpdateRequest request);

    void archiveById(VerifiedFirebaseToken firebaseToken, String shopId, ArchiveShopRequest request);

    ShopResponse updateStatus(
            VerifiedFirebaseToken firebaseToken,
            String shopId,
            ShopStatusUpdateRequest request);

    Shop requireOwnedActiveShop(VerifiedFirebaseToken firebaseToken, String shopIdHeader);
}
