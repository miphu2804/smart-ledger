package com.smartledger.core.billing;

import java.util.List;

/** Server-owned versioned prices; buying a plan never changes feature authorization. */
public record BillingPlanResponse(String planCode, int version, long amountVnd, String currency,
        Integer durationMonths, String featureScope, AiQuota aiQuota) {
    public record AiQuota(int limit, String period, String scope) {}

    public static List<BillingPlanResponse> catalog() {
        return List.of(new BillingPlanResponse("FREE", 1, 0, "VND", null, "EXISTING_FEATURES", new AiQuota(2, "DAY", "OWNER")),
                new BillingPlanResponse("FULL_MONTHLY", 1, 99000, "VND", 1, "EXISTING_FEATURES", new AiQuota(300, "WEEK", "OWNER")),
                new BillingPlanResponse("FULL_QUARTERLY", 1, 297000, "VND", 3, "EXISTING_FEATURES", new AiQuota(300, "WEEK", "OWNER")));
    }
}
