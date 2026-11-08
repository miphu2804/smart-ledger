package com.smartledger.core.billing;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.support.TransactionTemplate;

/** Durable entitlement fulfillment and shopless OWNER projections; no AI calls or quota writes. */
@Service
public class SubscriptionService {
    private final BillingRepository billing;
    private final SubscriptionRepository repository;
    private final SubscriptionProperties properties;
    private final Clock clock;
    private final TransactionTemplate transaction;
    private final ChatQuotaProperties quotaProperties;

    public SubscriptionService(BillingRepository billing, SubscriptionRepository repository,
            SubscriptionProperties properties, @Qualifier("billingClock") Clock clock, PlatformTransactionManager manager) {
        this(billing, repository, properties, clock, manager, new ChatQuotaProperties(false, false));
    }

    @org.springframework.beans.factory.annotation.Autowired
    public SubscriptionService(BillingRepository billing, SubscriptionRepository repository,
            SubscriptionProperties properties, @Qualifier("billingClock") Clock clock, PlatformTransactionManager manager,
            ChatQuotaProperties quotaProperties) {
        this.billing = billing; this.repository = repository; this.properties = properties; this.clock = clock;
        this.quotaProperties = quotaProperties;
        transaction = new TransactionTemplate(manager); transaction.setTimeout(5);
    }

    /** Authenticated effective access falls back to Free at exact expiry, without a scheduler write. */
    public SubscriptionResponse subscription(VerifiedFirebaseToken token) {
        return inTransaction(() -> {
            long owner = billing.owner(token.uid(), false);
            var now = SubscriptionPolicy.now(clock.instant());
            var period = repository.current(owner, false).orElse(null);
            boolean active = active(period, now);
            return new SubscriptionResponse(active ? "FULL" : "FREE", repository.lastPlan(owner), "OWNER",
                    active ? "ACTIVE" : "FREE", active ? period.anchor() : null,
                    active ? period.expires() : null, active ? period.anchor() : null, "MANUAL");
        });
    }

    /** Reads existing counters only. Missing/unsupported storage never fabricates usable paid capacity. */
    public QuotaResponse quota(VerifiedFirebaseToken token) {
        return inTransaction(() -> {
            long owner = billing.owner(token.uid(), false);
            var now = SubscriptionPolicy.now(clock.instant());
            var period = repository.current(owner, false).orElse(null);
            boolean active = active(period, now);
            if (active && period.policy() != 1) throw new BusinessException(ErrorCode.BILLING_UNAVAILABLE);
            var window = active ? SubscriptionPolicy.paid(now, period.anchor(), period.expires()) : SubscriptionPolicy.free(now);
            var counts = repository.counts(owner, active ? period.id() : null, window).orElse(null);
            if (counts != null && (counts.policy() != 1 || counts.limit() != window.limit()
                    || !counts.nominalEnd().isEqual(window.nominalEnd()))) throw new BusinessException(ErrorCode.BILLING_UNAVAILABLE);
            int committed = counts == null ? 0 : counts.committed();
            int reserved = counts == null ? 0 : counts.reserved();
            return new QuotaResponse(active ? "FULL" : "FREE", window.limit(), committed, reserved,
                    Math.max(0, window.limit() - committed - reserved), window.start(), window.end(), window.nextReset(),
                    active ? period.expires() : null, quotaProperties.enabled());
        });
    }

    List<Long> pending(long afterId) {
        return properties.fulfillmentEnabled() ? inTransaction(() -> repository.candidates(afterId)) : List.of();
    }

    /** A worker retry cannot apply a second grant. Capture activation time after the owner/period locks. */
    boolean fulfill(long request) {
        if (!properties.fulfillmentEnabled()) return false;
        return inTransaction(() -> {
            var purchase = repository.lockPurchase(request).orElse(null);
            if (purchase == null || !repository.lockActiveOwner(purchase.owner())) return false;
            var old = repository.current(purchase.owner(), true).orElse(null);
            var now = SubscriptionPolicy.now(clock.instant());
            // A backward clock must not turn an existing future anchor into an overlapping new epoch.
            if (old != null && now.isBefore(old.anchor())) return false;
            SubscriptionRepository.Period applied;
            OffsetDateTime previous = null;
            if (active(old, now)) {
                if (old.policy() != purchase.policy()) return false;
                previous = old.expires();
                applied = repository.extend(old, purchase.months());
            } else {
                if (old != null) repository.close(old);
                applied = repository.start(purchase.owner(), now, purchase);
            }
            repository.grant(purchase, applied, previous, now);
            return true;
        });
    }

    private static boolean active(SubscriptionRepository.Period period, OffsetDateTime now) {
        return period != null && !now.isBefore(period.anchor()) && now.isBefore(period.expires());
    }

    private <T> T inTransaction(Supplier<T> operation) {
        try { return transaction.execute(status -> { billing.deadlines(); return operation.get(); }); }
        catch (DataAccessException | TransactionException exception) { throw new BusinessException(ErrorCode.BILLING_UNAVAILABLE); }
    }
}
