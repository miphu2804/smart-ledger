package com.smartledger.core.service;

import com.smartledger.core.dto.request.CustomerWriteRequest;
import com.smartledger.core.dto.request.OwnerListQuery.Customers;
import com.smartledger.core.dto.response.CustomerResponse;
import com.smartledger.core.dto.response.PageResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;

public interface CustomerService {
    CustomerResponse create(VerifiedFirebaseToken token, String shopId, CustomerWriteRequest request);

    PageResponse<CustomerResponse> list(VerifiedFirebaseToken token, String shopId, Customers query);

    CustomerResponse getById(VerifiedFirebaseToken token, String shopId, String customerId);

    CustomerResponse replace(VerifiedFirebaseToken token, String shopId, String customerId,
            CustomerWriteRequest request);

    void archive(VerifiedFirebaseToken token, String shopId, String customerId);
}
