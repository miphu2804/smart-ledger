package com.smartledger.core.service;

import com.smartledger.core.dto.request.SaleVoidRequest;
import com.smartledger.core.dto.response.SaleRefundResponse;
import com.smartledger.core.dto.response.SaleVoidResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;

public interface SaleVoidService {
    SaleVoidResponse voidSale(VerifiedFirebaseToken token, String shopId, String saleId,
            String idempotencyKey, SaleVoidRequest request);

    SaleRefundResponse getRefund(VerifiedFirebaseToken token, String shopId, String saleId);
}
