package com.smartledger.core.service;

import com.smartledger.core.dto.response.ReportSummaryResponse;
import com.smartledger.core.dto.response.ProfitEstimateReportResponse;
import com.smartledger.core.dto.response.SalesSeriesReportResponse;
import com.smartledger.core.dto.response.TopProductsReportResponse;
import com.smartledger.core.enums.ReportGranularity;
import com.smartledger.core.enums.TopProductSort;
import com.smartledger.core.security.VerifiedFirebaseToken;

public interface ReportService {
    ReportSummaryResponse summary(VerifiedFirebaseToken token, String shopId, String period);

    TopProductsReportResponse topProducts(VerifiedFirebaseToken token, String shopId, String period,
            int limit, TopProductSort sortBy);

    SalesSeriesReportResponse salesSeries(VerifiedFirebaseToken token, String shopId, String period,
            ReportGranularity granularity);

    ProfitEstimateReportResponse profitEstimate(VerifiedFirebaseToken token, String shopId, String period);
}
