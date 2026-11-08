package com.smartledger.core.billing;

import java.time.OffsetDateTime;

/** Read-only policy/counters; enforcementEnabled reflects the configured Core admission gate. */
public record QuotaResponse(String effectiveTier, int limit, int committed, int reserved, int remaining,
        OffsetDateTime windowStart, OffsetDateTime windowEnd, OffsetDateTime nextResetAt,
        OffsetDateTime accessExpiresAt, boolean enforcementEnabled) {}
