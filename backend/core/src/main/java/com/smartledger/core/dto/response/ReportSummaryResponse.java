package com.smartledger.core.dto.response;

import java.time.OffsetDateTime;
import io.swagger.v3.oas.annotations.media.Schema;

public record ReportSummaryResponse(String period, OffsetDateTime fromInclusive, OffsetDateTime toExclusive,
        @Schema(description = "Total sale value recorded in this period by soldAt, before void adjustments.")
        long grossRevenueVnd,
        @Schema(description = "Total sale value cancelled in this period by voidedAt, including sales from earlier periods.")
        long voidedRevenueVnd,
        @Schema(description = "grossRevenueVnd minus voidedRevenueVnd; may be negative. Not cash collected or profit.")
        long netRevenueVnd, long collectedVnd, long expenseVnd,
        long currentOutstandingDebtVnd, long orderCount,
        long refundedVnd, long voidedOrderCount) {
}
