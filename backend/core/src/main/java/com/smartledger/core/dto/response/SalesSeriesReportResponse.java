package com.smartledger.core.dto.response;

import com.smartledger.core.enums.ReportGranularity;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public record SalesSeriesReportResponse(String period, OffsetDateTime fromInclusive,
        OffsetDateTime toExclusive, ReportGranularity granularity, List<DailySales> items) {

    public record DailySales(LocalDate date, long grossRevenueVnd, long voidedRevenueVnd,
            long netRevenueVnd, long orderCount, long voidedOrderCount) {
    }
}
