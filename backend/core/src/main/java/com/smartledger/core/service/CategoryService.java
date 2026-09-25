package com.smartledger.core.service;

import com.smartledger.core.dto.request.CategoryWriteRequest;
import com.smartledger.core.dto.response.CategoryResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.util.List;

public interface CategoryService {
    CategoryResponse create(VerifiedFirebaseToken firebaseToken, String shopId, CategoryWriteRequest request);

    List<CategoryResponse> list(VerifiedFirebaseToken firebaseToken, String shopId);

    CategoryResponse getById(VerifiedFirebaseToken firebaseToken, String shopId, String categoryId);

    CategoryResponse replace(VerifiedFirebaseToken firebaseToken, String shopId, String categoryId,
            CategoryWriteRequest request);

    void archive(VerifiedFirebaseToken firebaseToken, String shopId, String categoryId);
}
