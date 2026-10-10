package com.smartledger.core.service;

import com.smartledger.core.dto.request.ExpensePatchRequest;
import com.smartledger.core.dto.request.ExpenseWriteRequest;
import com.smartledger.core.dto.request.OwnerListQuery.Expenses;
import com.smartledger.core.dto.response.ExpenseResponse;
import com.smartledger.core.dto.response.PageResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;

public interface ExpenseService {
    ExpenseResponse create(VerifiedFirebaseToken token, String shopId, String idempotencyKey,
            ExpenseWriteRequest request);

    PageResponse<ExpenseResponse> list(VerifiedFirebaseToken token, String shopId, Expenses query);

    ExpenseResponse getById(VerifiedFirebaseToken token, String shopId, String expenseId);

    ExpenseResponse patch(VerifiedFirebaseToken token, String shopId, String expenseId, ExpensePatchRequest request);

    void archive(VerifiedFirebaseToken token, String shopId, String expenseId);
}
