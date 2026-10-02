package com.smartledger.core.service;

import com.smartledger.core.dto.request.ExpensePatchRequest;
import com.smartledger.core.dto.request.ExpenseWriteRequest;
import com.smartledger.core.dto.response.ExpenseResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.util.List;

public interface ExpenseService {
    ExpenseResponse create(VerifiedFirebaseToken token, String shopId, String idempotencyKey,
            ExpenseWriteRequest request);

    List<ExpenseResponse> list(VerifiedFirebaseToken token, String shopId, String period);

    ExpenseResponse getById(VerifiedFirebaseToken token, String shopId, String expenseId);

    ExpenseResponse patch(VerifiedFirebaseToken token, String shopId, String expenseId, ExpensePatchRequest request);

    void archive(VerifiedFirebaseToken token, String shopId, String expenseId);
}
