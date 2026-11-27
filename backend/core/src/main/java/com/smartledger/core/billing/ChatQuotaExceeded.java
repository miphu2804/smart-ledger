package com.smartledger.core.billing;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.ApiErrorDetail;
import com.smartledger.core.exception.BusinessException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;

/** The next policy boundary is a retry/read hint, not a promise of available capacity. */
public final class ChatQuotaExceeded extends BusinessException {
    private final long retryAfter;
    public ChatQuotaExceeded(OffsetDateTime now, OffsetDateTime boundary) {
        super(ErrorCode.AI_QUOTA_EXHAUSTED, List.of(new ApiErrorDetail("nextAvailableAt",
                boundary.atZoneSameInstant(SubscriptionPolicy.ZONE).toOffsetDateTime().toString())));
        retryAfter = Math.max(1, (Duration.between(now, boundary).toMillis() + 999) / 1000);
    }
    public long retryAfter() { return retryAfter; }
}
