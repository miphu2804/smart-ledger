package com.smartledger.core.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

/** Totals over the entire filtered sale set, not a page or a cashflow report. */
public record SaleSummaryResponse(
        @Schema(requiredMode = RequiredMode.REQUIRED, minimum = "0",
                description = "All matching sales, including VOIDED; excludes unconfirmed drafts.")
        long matchedOrderCount,
        @Schema(requiredMode = RequiredMode.REQUIRED, minimum = "0",
                description = "Matching sales whose current status is CONFIRMED.")
        long confirmedOrderCount,
        @Schema(requiredMode = RequiredMode.REQUIRED, minimum = "0",
                description = "Matching sales whose current status is VOIDED.")
        long voidedOrderCount,
        @Schema(requiredMode = RequiredMode.REQUIRED, minimum = "0",
                description = "Sum of discounted totalVnd for matching CONFIRMED sales filtered by soldAt; "
                        + "includes unpaid/partial sales, not cash collected or report netRevenueVnd.")
        long confirmedSalesVnd,
        @Schema(requiredMode = RequiredMode.REQUIRED, minimum = "0",
                description = "Full discounted value of matching VOIDED sales by soldAt, not refunded money "
                        + "or a flow by voidedAt.")
        long voidedSalesVnd) {
}
