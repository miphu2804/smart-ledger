package com.smartledger.core.billing;

import static org.assertj.core.api.Assertions.assertThat;
import java.time.OffsetDateTime;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class SubscriptionPolicyTest {
    @ParameterizedTest
    @CsvSource({
        "2027-01-31T10:04:05+07:00,1,2027-02-28T10:04:05+07:00",
        "2027-01-31T10:04:05+07:00,2,2027-03-31T10:04:05+07:00",
        "2027-01-31T10:04:05+07:00,3,2027-04-30T10:04:05+07:00",
        "2028-01-31T10:04:05+07:00,1,2028-02-29T10:04:05+07:00",
        "2028-02-29T10:04:05+07:00,12,2029-02-28T10:04:05+07:00",
        "2026-12-31T10:04:05+07:00,3,2027-03-31T10:04:05+07:00",
        "2027-01-30T19:04:05Z,1,2027-02-28T02:04:05+07:00"
    })
    void originalAnchorHandlesLeapYearEndAndVietnamCalendar(String start, int months, String expected) {
        assertThat(SubscriptionPolicy.expiry(OffsetDateTime.parse(start), months)).isEqualTo(OffsetDateTime.parse(expected));
    }

    @ParameterizedTest
    @CsvSource({
        "2026-11-23T00:00:00+07:00,2026-11-23T00:00:00+07:00",
        "2026-11-27T21:30:00+07:00,2026-11-23T00:00:00+07:00",
        "2026-11-29T23:59:59.999999+07:00,2026-11-23T00:00:00+07:00",
        "2026-11-29T17:00:00Z,2026-11-30T00:00:00+07:00",
        "2026-12-31T10:00:00+07:00,2026-12-28T00:00:00+07:00"
    })
    void freeWindowIsOneHundredTurnsFromMondayVietnamTime(String now, String monday) {
        var window = SubscriptionPolicy.free(OffsetDateTime.parse(now));
        var start = OffsetDateTime.parse(monday);
        assertThat(window.start()).isEqualTo(start);
        assertThat(window.nominalEnd()).isEqualTo(start.plusWeeks(1));
        assertThat(window.end()).isEqualTo(start.plusWeeks(1));
        assertThat(window.nextReset()).isEqualTo(start.plusWeeks(1));
        assertThat(window.limit()).isEqualTo(100);
        assertThat(window.kind()).isEqualTo("FREE_DAILY");
    }
}
