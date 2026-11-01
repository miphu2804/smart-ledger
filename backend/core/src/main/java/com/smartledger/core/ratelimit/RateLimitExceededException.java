package com.smartledger.core.ratelimit;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;

/** Retry delay is calculated from committed quota or the earliest pending lease. */
public class RateLimitExceededException extends BusinessException {
    private final long retryAfter;
    public RateLimitExceededException(long retryAfter) {
        super(ErrorCode.RATE_LIMITED);
        this.retryAfter = Math.max(1, retryAfter);
    }
    public long retryAfter() { return retryAfter; }
}
