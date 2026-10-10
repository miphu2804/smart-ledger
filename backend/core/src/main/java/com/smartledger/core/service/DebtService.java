package com.smartledger.core.service;

import com.smartledger.core.dto.request.DebtRepaymentRequest;
import com.smartledger.core.dto.request.OwnerListQuery.Debts;
import com.smartledger.core.dto.response.DebtRepaymentResponse;
import com.smartledger.core.dto.response.DebtResponse;
import com.smartledger.core.dto.response.PageResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;

public interface DebtService {
    PageResponse<DebtResponse> list(VerifiedFirebaseToken token, String shopId, Debts query);

    DebtResponse getById(VerifiedFirebaseToken token, String shopId, String debtId);

    DebtRepaymentResponse repay(VerifiedFirebaseToken token, String shopId, String debtId, String idempotencyKey,
            DebtRepaymentRequest request);
}
