package com.smartledger.core.service;

import com.smartledger.core.dto.request.ProductPatchRequest;
import com.smartledger.core.dto.request.ProductStockInRequest;
import com.smartledger.core.dto.request.ProductWriteRequest;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.util.List;

public interface ProductService {
    ProductResponse create(VerifiedFirebaseToken firebaseToken, String shopId, ProductWriteRequest request);

    List<ProductResponse> list(VerifiedFirebaseToken firebaseToken, String shopId);

    ProductResponse getById(VerifiedFirebaseToken firebaseToken, String shopId, String productId);

    ProductResponse patch(VerifiedFirebaseToken firebaseToken, String shopId, String productId,
            ProductPatchRequest request);

    void archive(VerifiedFirebaseToken firebaseToken, String shopId, String productId);

    ProductResponse stockIn(VerifiedFirebaseToken firebaseToken, String shopId, String productId,
            String idempotencyKey, ProductStockInRequest request);
}
