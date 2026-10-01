package com.smartledger.core.service;

import com.smartledger.core.dto.response.ReportSummaryResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;

public interface ReportService {
    ReportSummaryResponse summary(VerifiedFirebaseToken token, String shopId, String period);
}
