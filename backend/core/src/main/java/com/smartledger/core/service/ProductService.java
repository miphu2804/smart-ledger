package com.smartledger.core.service;

import com.smartledger.core.dto.request.ProductWriteRequest;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.util.List;

public interface ProductService {
    ProductResponse create(VerifiedFirebaseToken firebaseToken, String shopId, ProductWriteRequest request);

    List<ProductResponse> list(VerifiedFirebaseToken firebaseToken, String shopId);

    ProductResponse getById(VerifiedFirebaseToken firebaseToken, String shopId, String productId);

    ProductResponse replace(VerifiedFirebaseToken firebaseToken, String shopId, String productId,
            ProductWriteRequest request);

    void archive(VerifiedFirebaseToken firebaseToken, String shopId, String productId);
}
