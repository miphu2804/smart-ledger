package com.smartledger.core.service.impl;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

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
}
