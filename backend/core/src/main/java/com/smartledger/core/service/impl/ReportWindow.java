package com.smartledger.core.service.impl;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.Locale;

record ReportWindow(String period, OffsetDateTime fromInclusive, OffsetDateTime toExclusive) {
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    static ReportWindow of(String value, OffsetDateTime now) {
        String period = value == null || value.isBlank() ? "today" : value.toLowerCase(Locale.ROOT);
        LocalDate today = now.atZoneSameInstant(BUSINESS_ZONE).toLocalDate();
        LocalDate start = switch (period) {
            case "today" -> today;
            case "yesterday" -> today.minusDays(1);
            case "this_week" -> today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            case "week" -> today.minusDays(6);
            case "month" -> today.withDayOfMonth(1);
            case "year" -> today.withDayOfYear(1);
            default -> throw new BusinessException(ErrorCode.INVALID_REPORT_PERIOD);
        };
        OffsetDateTime from = start.atStartOfDay(BUSINESS_ZONE).toOffsetDateTime()
                .withOffsetSameInstant(ZoneOffset.UTC);
        OffsetDateTime to = ("yesterday".equals(period)
                ? today.atStartOfDay(BUSINESS_ZONE).toOffsetDateTime() : now)
                .withOffsetSameInstant(ZoneOffset.UTC);
        return new ReportWindow(period, from, to);
    }
}
