package com.smartledger.core.billing;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.dto.request.AgentChatRequest;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.support.TransactionTemplate;

/** Atomic slot admission/finalization; network calls never run inside these transactions. */
@Service
public class ChatQuotaLedger {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final ChatQuotaStore store;
    private final BillingRepository billing;
    private final SubscriptionRepository subscriptions;
    private final ChatQuotaProperties properties;
    private final Clock clock;
    private final TransactionTemplate transaction;
    public ChatQuotaLedger(ChatQuotaStore store, BillingRepository billing, SubscriptionRepository subscriptions,
            ChatQuotaProperties properties, @Qualifier("billingClock") Clock clock, PlatformTransactionManager manager) {
        this.store = store; this.billing = billing; this.subscriptions = subscriptions; this.properties = properties; this.clock = clock;
        transaction = new TransactionTemplate(manager); transaction.setTimeout(5);
    }
    public record Admission(ChatQuotaStore.Usage usage, boolean fresh) {}

    public Admission admit(VerifiedFirebaseToken token, Shop shop, AgentChatRequest input, String rawKey) {
        String key = rawKey == null ? "" : rawKey.strip();
        if (key.isBlank() || key.length() > 255) throw new BusinessException(ErrorCode.AI_TURN_KEY_INVALID);
        String message = input.message().strip();
        String hash;
        try { hash = BillingJson.sha256(JSON.writeValueAsBytes(Arrays.asList(1, shop.getOwnerId(), shop.getId(), input.conversationId(), message))); }
        catch (java.io.IOException exception) { throw unavailable(); }
        return inTransaction(() -> {
            long owner = billing.owner(token.uid(), true);
            if (owner != shop.getOwnerId() || !store.activeShop(owner, shop.getId())) throw new BusinessException(ErrorCode.SHOP_INACTIVE);
            var existing = store.key(owner, key);
            if (existing.isPresent()) {
                if (!existing.get().hash().equals(hash)) throw new BusinessException(ErrorCode.AI_TURN_CONFLICT);
                return new Admission(existing.get(), false);
            }
            if (!properties.enabled() || !properties.recoveryEnabled()) throw unavailable();
            var period = subscriptions.current(owner, false).orElse(null);
            for (int attempt = 0; attempt < 3; attempt++) {
                var before = now();
                boolean paid = paid(period, before);
                if (paid && period.policy() != 1) throw unavailable();
                var policy = paid ? SubscriptionPolicy.paid(before, period.anchor(), period.expires()) : SubscriptionPolicy.free(before);
                var window = store.window(owner, paid ? period.id() : null, policy);
                var admitted = now();
                boolean stillPaid = paid(period, admitted);
                var current = stillPaid ? SubscriptionPolicy.paid(admitted, period.anchor(), period.expires()) : SubscriptionPolicy.free(admitted);
                if (paid != stillPaid || !current.start().isEqual(policy.start())) continue;
                if (window.policy() != 1 || window.limit() != policy.limit() || !window.nominalEnd().isEqual(policy.nominalEnd())) throw unavailable();
                if ((long) window.committed() + window.reserved() >= window.limit()) throw new ChatQuotaExceeded(admitted, policy.end());
                return new Admission(store.reserve(owner, shop.getId(), key, hash, input.conversationId(), window, admitted), true);
            }
            throw unavailable();
        });
    }

    /** Returns false after another recovery owner fenced this caller. Terminal states never move again. */
    public boolean finish(ChatQuotaStore.Usage expected, String state, String failure) {
        if (!List.of("SUCCEEDED", "FAILED", "CANCELLED").contains(state)
                || (state.equals("SUCCEEDED") != (failure == null))) throw unavailable();
        return inTransaction(() -> {
            store.lockWindow(expected.window());
            var actual = store.usage(expected.id(), true).orElseThrow(() -> new IllegalStateException("Captured usage unavailable"));
            if (!actual.pending()) {
                if (!actual.state().equals(state)) throw unavailable();
                return true;
            }
            if (actual.fence() != expected.fence() || !actual.leaseOwner().equals(expected.leaseOwner())) return false;
            store.finish(actual, state, failure, now());
            return true;
        });
    }

    List<UUID> expired() { return properties.recoveryEnabled() ? inTransaction(() -> store.expired(now())) : List.of(); }
    ChatQuotaStore.Usage claim(UUID id) {
        if (!properties.recoveryEnabled()) return null;
        return inTransaction(() -> {
            var found = store.usage(id, false).orElse(null);
            if (found == null || !found.pending()) return null;
            store.lockWindow(found.window());
            var row = store.usage(id, true).orElseThrow(() -> new IllegalStateException("Captured usage unavailable"));
            var now = now();
            return row.pending() && !now.isBefore(row.leaseEnd()) ? store.claim(row, now) : null;
        });
    }
    private static boolean paid(SubscriptionRepository.Period period, OffsetDateTime now) {
        return period != null && !now.isBefore(period.anchor()) && now.isBefore(period.expires());
    }
    private OffsetDateTime now() { return SubscriptionPolicy.now(clock.instant()); }
    static BusinessException unavailable() { return new BusinessException(ErrorCode.AI_QUOTA_UNAVAILABLE); }
    private <T> T inTransaction(Supplier<T> action) {
        try { return transaction.execute(status -> { billing.deadlines(); return action.get(); }); }
        catch (DataAccessException | TransactionException | IllegalStateException | ArithmeticException exception) { throw unavailable(); }
    }
}
