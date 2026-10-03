package com.smartledger.core.service;

import com.smartledger.core.dto.request.DebtRepaymentRequest;
import com.smartledger.core.dto.response.DebtRepaymentResponse;
import com.smartledger.core.dto.response.DebtResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.util.List;

public interface DebtService {
    List<DebtResponse> list(VerifiedFirebaseToken token, String shopId);

    DebtResponse getById(VerifiedFirebaseToken token, String shopId, String debtId);

    DebtRepaymentResponse repay(VerifiedFirebaseToken token, String shopId, String debtId, String idempotencyKey,
            DebtRepaymentRequest request);
}
