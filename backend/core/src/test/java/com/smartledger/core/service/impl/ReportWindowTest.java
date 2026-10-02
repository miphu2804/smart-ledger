package com.smartledger.core.service.impl;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class ReportWindowTest {
    private final OffsetDateTime now = OffsetDateTime.parse("2026-09-28T03:00:00Z");

    @Test
    void usesVietnamCalendarBoundaries() {
        assertThat(ReportWindow.of("today", now).fromInclusive())
                .isEqualTo(OffsetDateTime.parse("2026-09-27T17:00:00Z"));
        assertThat(ReportWindow.of("yesterday", now).toExclusive())
                .isEqualTo(OffsetDateTime.parse("2026-09-27T17:00:00Z"));
        assertThat(ReportWindow.of("this_week", now).fromInclusive())
                .isEqualTo(OffsetDateTime.parse("2026-09-27T17:00:00Z"));
        assertThat(ReportWindow.of("week", now).fromInclusive())
                .isEqualTo(OffsetDateTime.parse("2026-09-21T17:00:00Z"));
        assertThat(ReportWindow.of("month", now).fromInclusive())
                .isEqualTo(OffsetDateTime.parse("2026-08-31T17:00:00Z"));
        assertThat(ReportWindow.of("year", now).fromInclusive())
                .isEqualTo(OffsetDateTime.parse("2025-12-31T17:00:00Z"));
        assertThat(ReportWindow.of("year", now).toExclusive()).isEqualTo(now);
    }

    @ParameterizedTest
    @CsvSource({
            "today, 2026-12-31T17:00:01Z, 2026-12-31T17:00:00Z, 2026-12-31T17:00:01Z",
            "today, 2026-12-31T16:59:59Z, 2026-12-30T17:00:00Z, 2026-12-31T16:59:59Z",
            "yesterday, 2026-12-31T17:00:01Z, 2026-12-30T17:00:00Z, 2026-12-31T17:00:00Z",
            "this_week, 2026-10-04T17:00:01Z, 2026-10-04T17:00:00Z, 2026-10-04T17:00:01Z",
            "week, 2026-12-31T17:00:01Z, 2026-12-25T17:00:00Z, 2026-12-31T17:00:01Z",
            "month, 2026-09-30T17:00:01Z, 2026-09-30T17:00:00Z, 2026-09-30T17:00:01Z",
            "year, 2026-12-31T17:00:01Z, 2026-12-31T17:00:00Z, 2026-12-31T17:00:01Z"
    })
    void usesVietnamCalendarBoundariesAndUtcQueryInstants(String period, String now, String from, String to) {
        var window = ReportWindow.of(period, OffsetDateTime.parse(now));
        assertThat(window.fromInclusive()).isEqualTo(OffsetDateTime.parse(from));
        assertThat(window.toExclusive()).isEqualTo(OffsetDateTime.parse(to));
        var sameInstant = ReportWindow.of(period,
                OffsetDateTime.parse(now).withOffsetSameInstant(java.time.ZoneOffset.ofHours(-7)));
        assertThat(sameInstant).isEqualTo(window);
    }
}
