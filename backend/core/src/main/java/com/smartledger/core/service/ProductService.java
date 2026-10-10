package com.smartledger.core.service;

import com.smartledger.core.dto.request.OwnerListQuery.Products;
import com.smartledger.core.dto.request.ProductPatchRequest;
import com.smartledger.core.dto.request.ProductStockInRequest;
import com.smartledger.core.dto.request.ProductWriteRequest;
import com.smartledger.core.dto.response.PageResponse;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;

public interface ProductService {
    ProductResponse create(VerifiedFirebaseToken firebaseToken, String shopId, ProductWriteRequest request);

    PageResponse<ProductResponse> list(VerifiedFirebaseToken token, String shopId, Products query);

    ProductResponse getById(VerifiedFirebaseToken firebaseToken, String shopId, String productId);

    ProductResponse patch(VerifiedFirebaseToken firebaseToken, String shopId, String productId,
            ProductPatchRequest request);

    void archive(VerifiedFirebaseToken firebaseToken, String shopId, String productId);

    ProductResponse stockIn(VerifiedFirebaseToken firebaseToken, String shopId, String productId,
            String idempotencyKey, ProductStockInRequest request);
}
