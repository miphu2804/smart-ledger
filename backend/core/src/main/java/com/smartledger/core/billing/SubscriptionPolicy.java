package com.smartledger.core.billing;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

/** Calendar terms and fixed seven-day epochs; renewal always computes from the original anchor. */
final class SubscriptionPolicy {
    static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private SubscriptionPolicy() {}

    static OffsetDateTime now(Instant instant) {
        return instant.truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC);
    }

    static OffsetDateTime expiry(OffsetDateTime anchor, int purchasedMonths) {
        return anchor.atZoneSameInstant(ZONE).plusMonths(purchasedMonths).toOffsetDateTime();
    }

    record Window(String kind, OffsetDateTime start, OffsetDateTime nominalEnd, OffsetDateTime end,
            OffsetDateTime nextReset, int limit) {}

    static Window free(OffsetDateTime now) {
        var start = now.atZoneSameInstant(ZONE).toLocalDate().atStartOfDay(ZONE);
        var end = start.plusDays(1).toOffsetDateTime();
        return new Window("FREE_DAILY", start.toOffsetDateTime(), end, end, end, 2);
    }

    static Window paid(OffsetDateTime now, OffsetDateTime anchor, OffsetDateTime expires) {
        long week = ChronoUnit.SECONDS.between(anchor.toInstant(), now.toInstant()) / 604800;
        var start = anchor.plusDays(Math.multiplyExact(week, 7));
        var nominal = start.plusDays(7);
        var end = nominal.isBefore(expires) ? nominal : expires;
        return new Window("PAID_WEEKLY", start, nominal, end, nominal.isBefore(expires) ? nominal : null, 300);
    }
}
