package com.smartledger.core.dto.response;

import com.smartledger.core.enums.ReportItemSource;
import com.smartledger.core.enums.TopProductSort;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

public record TopProductsReportResponse(String period, OffsetDateTime fromInclusive,
        OffsetDateTime toExclusive, TopProductSort sortBy, List<TopProduct> items) {

    public record TopProduct(String itemKey, Long productId, String productName, String unit,
            ReportItemSource source, BigDecimal grossQuantity, BigDecimal voidedQuantity,
            BigDecimal netQuantity, long grossRevenueVnd, long voidedRevenueVnd,
            long netRevenueVnd) {
    }
}
