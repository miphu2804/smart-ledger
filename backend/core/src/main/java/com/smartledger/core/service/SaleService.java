package com.smartledger.core.service;

import com.smartledger.core.dto.request.OwnerListQuery.Sales;
import com.smartledger.core.dto.request.OwnerListQuery.SalesSummary;
import com.smartledger.core.dto.response.PageResponse;
import com.smartledger.core.dto.response.SaleResponse;
import com.smartledger.core.dto.response.SaleSummaryResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;

public interface SaleService {
    PageResponse<SaleResponse> list(VerifiedFirebaseToken token, String shopId, Sales query);

    SaleSummaryResponse summary(VerifiedFirebaseToken token, String shopId, SalesSummary query);

    SaleResponse getById(VerifiedFirebaseToken token, String shopId, String saleId);
}
