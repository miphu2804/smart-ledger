package com.smartledger.core.ratelimit;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.UserRateLimitRepository;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Quota commits with business data; only window anchoring and abandoned-lease release commit independently. */
@Service
public class UserRateLimitService {
    private final UserRateLimitRepository repository;
    private final boolean enabled;
    private final int leaseSeconds;
    public UserRateLimitService(UserRateLimitRepository repository,
            @Value("${smartledger.rate-limit.enabled:false}") boolean enabled,
            @Value("${smartledger.media.upload-lease-seconds:300}") int leaseSeconds) {
        if (leaseSeconds <= 0) throw new IllegalArgumentException("Rate-limit lease must be positive");
        this.repository = repository; this.enabled = enabled; this.leaseSeconds = leaseSeconds;
    }
    public boolean enabled() { return enabled; }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void touch(long userId, RateLimitPolicy policy) {
        if (enabled) available(() -> repository.touch(userId, policy));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void prepare(long userId, RateLimitPolicy policy) {
        if (enabled) available(() -> repository.touch(userId, policy));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void reserve(long userId, RateLimitPolicy policy, UUID token) {
        if (enabled) available(() -> repository.reserve(userId, policy, token, leaseSeconds));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void complete(long userId, RateLimitPolicy policy, UUID token) {
        if (enabled) available(() -> repository.complete(userId, policy, token));
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void release(long userId, RateLimitPolicy policy, UUID token) {
        if (enabled) available(() -> repository.release(userId, policy, token));
    }

    @Scheduled(fixedDelayString = "${smartledger.rate-limit.cleanup-delay-ms:3600000}")
    @Transactional
    public void cleanup() {
        if (enabled) available(repository::cleanup);
    }

    private void available(Runnable action) {
        try { action.run(); }
        catch (DataAccessException error) { throw new BusinessException(ErrorCode.RATE_LIMIT_UNAVAILABLE); }
    }
}
