package com.smartledger.core.billing;

import java.time.OffsetDateTime;

/** Effective access at read time, independent of the grant scheduler's current flag. */
public record SubscriptionResponse(String effectiveTier, String lastPurchasedPlanCode, String scope,
        String status, OffsetDateTime activatedAt, OffsetDateTime expiresAt, OffsetDateTime weeklyAnchorAt,
        String renewalMode) {}
