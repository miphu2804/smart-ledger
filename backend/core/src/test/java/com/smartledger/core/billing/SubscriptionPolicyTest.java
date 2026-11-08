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
}
