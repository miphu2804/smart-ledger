package com.smartledger.core.billing;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** V21 subscription storage. Grant transactions lock request, user, then current period. */
@Repository
public class SubscriptionRepository {
    private final JdbcTemplate jdbc;
    public SubscriptionRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    record Purchase(long request, long owner, String integration, long accepted, int months, int policy) {}
    record Period(long id, OffsetDateTime anchor, int months, int policy, OffsetDateTime expires, long version) {}
    record Counts(int committed, int reserved, int limit, int policy, OffsetDateTime nominalEnd) {}
    private static final RowMapper<Period> PERIOD = (rs, row) -> new Period(rs.getLong("id"),
            rs.getObject("activated_at", OffsetDateTime.class), rs.getInt("purchased_months"),
            rs.getInt("quota_policy_version"), rs.getObject("expires_at", OffsetDateTime.class), rs.getLong("version"));

    static final int CANDIDATE_BATCH = 20;

    List<Long> candidates(long afterId) {
        return jdbc.query("""
                SELECT r.id FROM billing_payment_requests r JOIN users u ON u.id=r.payer_user_id
                WHERE r.status='PAID' AND r.fulfillment_status='PENDING' AND u.status='ACTIVE' AND u.system_role='OWNER'
                    AND r.id>? AND r.plan_version=1 AND r.quota_policy_version=1
                    AND ((r.plan_code='FULL_MONTHLY' AND r.duration_months=1)
                        OR (r.plan_code='FULL_QUARTERLY' AND r.duration_months=3))
                ORDER BY r.id LIMIT ?
                """, (rs, row) -> rs.getLong(1), afterId, CANDIDATE_BATCH);
    }

    Optional<Purchase> lockPurchase(long id) {
        return jdbc.query("""
                SELECT r.id,r.payer_user_id,r.integration_key,b.id AS accepted_id,r.duration_months,r.quota_policy_version
                FROM billing_payment_requests r JOIN billing_bank_transactions b ON b.matched_request_id=r.id
                    AND b.payer_user_id=r.payer_user_id AND b.integration_key=r.integration_key AND b.disposition='ACCEPTED'
                WHERE r.id=? AND r.status='PAID' AND r.fulfillment_status='PENDING'
                    AND r.plan_version=1 AND r.quota_policy_version=1
                    AND ((r.plan_code='FULL_MONTHLY' AND r.duration_months=1)
                        OR (r.plan_code='FULL_QUARTERLY' AND r.duration_months=3))
                FOR UPDATE OF r SKIP LOCKED
                """, (rs, row) -> new Purchase(rs.getLong("id"), rs.getLong("payer_user_id"),
                rs.getString("integration_key"), rs.getLong("accepted_id"), rs.getInt("duration_months"),
                rs.getInt("quota_policy_version")), id).stream().findFirst();
    }

    boolean lockActiveOwner(long user) {
        return jdbc.query("SELECT status,system_role FROM users WHERE id=? FOR UPDATE", (rs, row) ->
                "ACTIVE".equals(rs.getString("status")) && "OWNER".equals(rs.getString("system_role")), user)
                .stream().findFirst().orElse(false);
    }

    Optional<Period> current(long user, boolean lock) {
        return jdbc.query("SELECT * FROM billing_subscription_periods WHERE user_id=? AND is_current"
                + (lock ? " FOR UPDATE" : ""), PERIOD, user).stream().findFirst();
    }

    String lastPlan(long user) {
        return jdbc.query("""
                SELECT r.plan_code FROM billing_subscription_grants g
                JOIN billing_payment_requests r ON r.id=g.payment_request_id
                WHERE g.user_id=? ORDER BY g.applied_at DESC,g.id DESC LIMIT 1
                """, (rs, row) -> rs.getString(1), user).stream().findFirst().orElse(null);
    }

    Period start(long user, OffsetDateTime now, Purchase purchase) {
        var expires = SubscriptionPolicy.expiry(now, purchase.months());
        return jdbc.queryForObject("""
                INSERT INTO billing_subscription_periods(user_id,activated_at,purchased_months,quota_policy_version,
                    expires_at,is_current,version) VALUES (?,?,?,?,?,true,1) RETURNING *
                """, PERIOD, user, now, purchase.months(), purchase.policy(), expires);
    }

    void close(Period period) {
        one(jdbc.update("UPDATE billing_subscription_periods SET is_current=false WHERE id=? AND is_current", period.id()));
    }

    Period extend(Period period, int months) {
        int total = Math.addExact(period.months(), months);
        long version = Math.addExact(period.version(), 1);
        var expires = SubscriptionPolicy.expiry(period.anchor(), total);
        one(jdbc.update("""
                UPDATE billing_subscription_periods SET purchased_months=?,expires_at=?,version=? WHERE id=? AND version=?
                """, total, expires, version, period.id(), period.version()));
        return new Period(period.id(), period.anchor(), total, period.policy(), expires, version);
    }

    void grant(Purchase purchase, Period period, OffsetDateTime previousExpiry, OffsetDateTime now) {
        Long grant = jdbc.queryForObject("""
                INSERT INTO billing_subscription_grants(payment_request_id,accepted_transaction_id,user_id,integration_key,
                    period_id,period_version,duration_months,previous_expires_at,resulting_expires_at,applied_at)
                VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id
                """, Long.class, purchase.request(), purchase.accepted(), purchase.owner(), purchase.integration(),
                period.id(), period.version(), purchase.months(), previousExpiry, period.expires(), now);
        if (grant == null) throw new IllegalStateException("Subscription evidence was not stored");
        one(jdbc.update("""
                UPDATE billing_payment_requests SET fulfillment_status='APPLIED',fulfilled_grant_id=?
                WHERE id=? AND status='PAID' AND fulfillment_status='PENDING'
                """, grant, purchase.request()));
    }

    Optional<Counts> counts(long owner, Long period, SubscriptionPolicy.Window window) {
        return jdbc.query("""
                SELECT committed_count,reserved_count,limit_count,policy_version,nominal_end FROM ai_quota_windows
                WHERE user_id=? AND kind=? AND period_id IS NOT DISTINCT FROM ?::bigint AND window_start=?
                """, (rs, row) -> new Counts(rs.getInt(1), rs.getInt(2), rs.getInt(3), rs.getInt(4),
                rs.getObject(5, OffsetDateTime.class)), owner, window.kind(), period, window.start()).stream().findFirst();
    }

    private static void one(int affected) {
        if (affected != 1) throw new IllegalStateException("Subscription change was not stored");
    }
}
