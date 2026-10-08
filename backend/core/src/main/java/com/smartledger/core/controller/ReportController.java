package com.smartledger.core.controller;

import com.smartledger.core.dto.response.ReportSummaryResponse;
import com.smartledger.core.dto.response.ProfitEstimateReportResponse;
import com.smartledger.core.dto.response.SalesSeriesReportResponse;
import com.smartledger.core.dto.response.TopProductsReportResponse;
import com.smartledger.core.enums.ReportGranularity;
import com.smartledger.core.enums.TopProductSort;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ReportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/reports")
@Tag(name = "Reports")
@SecurityRequirement(name = "bearerAuth")
public class ReportController {
    private final ReportService service;

    public ReportController(ReportService service) {
        this.service = service;
    }

    @GetMapping("/summary")
    @Operation(summary = "Summarize confirmed revenue, collected payments, expenses, and current debt")
    public ReportSummaryResponse summary(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @RequestParam(required = false) String period) {
        return service.summary(token, shopId, period);
    }

    @GetMapping("/top-products")
    @Operation(summary = "Rank catalog and custom items by quantity or adjusted sale value")
    public TopProductsReportResponse topProducts(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @RequestParam(required = false) String period,
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(defaultValue = "NET_REVENUE") TopProductSort sortBy) {
        return service.topProducts(token, shopId, period, limit, sortBy);
    }

    @GetMapping("/sales-series")
    @Operation(summary = "Return a gap-free Vietnamese-calendar sales series")
    public SalesSeriesReportResponse salesSeries(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @RequestParam(required = false) String period,
            @RequestParam(defaultValue = "DAY") ReportGranularity granularity) {
        return service.salesSeries(token, shopId, period, granularity);
    }

    @GetMapping("/profit-estimate")
    @Operation(summary = "Estimate gross and operating profit from snapshotted item costs")
    public ProfitEstimateReportResponse profitEstimate(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @RequestParam(required = false) String period) {
        return service.profitEstimate(token, shopId, period);
    }
}
