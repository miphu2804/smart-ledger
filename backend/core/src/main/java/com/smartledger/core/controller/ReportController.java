package com.smartledger.core.controller;

import com.smartledger.core.dto.response.ReportSummaryResponse;
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
}
