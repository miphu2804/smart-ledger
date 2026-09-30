package com.smartledger.core.dto.response;

import java.time.OffsetDateTime;

public record ReportSummaryResponse(String period, OffsetDateTime fromInclusive, OffsetDateTime toExclusive,
        long confirmedRevenueVnd, long collectedVnd, long expenseVnd,
        long currentOutstandingDebtVnd, long orderCount) {
}
