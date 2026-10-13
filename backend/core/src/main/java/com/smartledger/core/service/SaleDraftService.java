package com.smartledger.core.service;

import com.smartledger.core.dto.request.OwnerListQuery.Drafts;
import com.smartledger.core.dto.request.SaleDraftWriteRequest;
import com.smartledger.core.dto.response.PageResponse;
import com.smartledger.core.dto.response.SaleDraftResponse;
import com.smartledger.core.dto.response.SaleResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;

public interface SaleDraftService {
    SaleDraftResponse create(VerifiedFirebaseToken token, String shopId, SaleDraftWriteRequest request);

    PageResponse<SaleDraftResponse> list(VerifiedFirebaseToken token, String shopId, Drafts query);

    SaleDraftResponse getById(VerifiedFirebaseToken token, String shopId, String draftId);

    SaleDraftResponse replace(VerifiedFirebaseToken token, String shopId, String draftId,
            SaleDraftWriteRequest request);

    void cancel(VerifiedFirebaseToken token, String shopId, String draftId);

    SaleResponse confirm(VerifiedFirebaseToken token, String shopId, String draftId);
}
