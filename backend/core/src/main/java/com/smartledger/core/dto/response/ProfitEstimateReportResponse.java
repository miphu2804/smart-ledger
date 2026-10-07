package com.smartledger.core.dto.response;

import java.time.OffsetDateTime;

public record ProfitEstimateReportResponse(String period, OffsetDateTime fromInclusive,
        OffsetDateTime toExclusive, long grossRevenueVnd, long voidedRevenueVnd,
        long netRevenueVnd, long grossEstimatedCogsVnd, long voidedEstimatedCogsVnd,
        long netEstimatedCogsVnd, long estimatedGrossProfitVnd, long expenseVnd,
        long estimatedOperatingProfitVnd, boolean isComplete, long unknownCostItemCount,
        long unknownCostRevenueVnd) {
}
