package com.smartledger.core.service;

import com.smartledger.core.dto.response.SaleResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.util.List;

public interface SaleService {
    List<SaleResponse> list(VerifiedFirebaseToken token, String shopId);

    SaleResponse getById(VerifiedFirebaseToken token, String shopId, String saleId);
}
