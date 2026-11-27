package com.smartledger.core.billing;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** V21 quota storage; callers lock one captured window before its usage. No text/results are copied. */
@Repository
public class ChatQuotaStore {
    private final JdbcTemplate jdbc;
    public ChatQuotaStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Usage(UUID id, long owner, long shop, String hash, Long conversation, UUID window,
            String state, long fence, UUID leaseOwner, OffsetDateTime admitted, OffsetDateTime leaseEnd, String failure) {
        public boolean pending() { return state.equals("RESERVED") || state.equals("RECONCILING"); }
    }
    record Window(UUID id, int policy, int limit, int committed, int reserved, OffsetDateTime nominalEnd) {}
    private static final RowMapper<Usage> USAGE = (rs, row) -> new Usage(rs.getObject("id", UUID.class),
            rs.getLong("user_id"), rs.getLong("shop_id"), rs.getString("request_hash"),
            rs.getObject("input_conversation_id", Long.class), rs.getObject("window_id", UUID.class), rs.getString("state"),
            rs.getLong("execution_fence"), rs.getObject("lease_owner", UUID.class), rs.getObject("admitted_at", OffsetDateTime.class),
            rs.getObject("lease_expires_at", OffsetDateTime.class), rs.getString("failure_code"));
    private static final RowMapper<Window> WINDOW = (rs, row) -> new Window(rs.getObject("id", UUID.class),
            rs.getInt("policy_version"), rs.getInt("limit_count"), rs.getInt("committed_count"), rs.getInt("reserved_count"),
            rs.getObject("nominal_end", OffsetDateTime.class));

    Optional<Usage> key(long owner, String key) {
        return jdbc.query("SELECT * FROM ai_turn_usages WHERE user_id=? AND operation='CHAT' AND idempotency_key=?",
                USAGE, owner, key).stream().findFirst();
    }
    Optional<Usage> usage(UUID id, boolean lock) {
        return jdbc.query("SELECT * FROM ai_turn_usages WHERE id=?" + (lock ? " FOR UPDATE" : ""), USAGE, id).stream().findFirst();
    }
    boolean activeShop(long owner, long shop) {
        return jdbc.query("SELECT status FROM shops WHERE id=? AND owner_id=? FOR SHARE", (rs, row) ->
                rs.getString(1).equals("ACTIVE"), shop, owner).stream().findFirst().orElse(false);
    }
    Window window(long owner, Long period, SubscriptionPolicy.Window window) {
        jdbc.update("""
                INSERT INTO ai_quota_windows(id,user_id,kind,period_id,policy_version,window_start,nominal_end,limit_count)
                VALUES (?,?,?,?,1,?,?,?) ON CONFLICT DO NOTHING
                """, UUID.randomUUID(), owner, window.kind(), period, window.start(), window.nominalEnd(), window.limit());
        return jdbc.query("""
                SELECT * FROM ai_quota_windows WHERE user_id=? AND kind=? AND period_id IS NOT DISTINCT FROM ?::bigint
                    AND window_start=? FOR UPDATE
                """, WINDOW, owner, window.kind(), period, window.start()).stream().findFirst()
                .orElseThrow(() -> new IllegalStateException("Quota window unavailable"));
    }
    void lockWindow(UUID id) {
        if (jdbc.query("SELECT id FROM ai_quota_windows WHERE id=? FOR UPDATE", (rs, row) -> rs.getObject(1), id).size() != 1)
            throw new IllegalStateException("Captured window unavailable");
    }
    Usage reserve(long owner, long shop, String key, String hash, Long conversation, Window window, OffsetDateTime now) {
        one(jdbc.update("""
                UPDATE ai_quota_windows SET reserved_count=reserved_count+1 WHERE id=?
                    AND committed_count::bigint+reserved_count::bigint<limit_count
                """, window.id()));
        UUID id = UUID.randomUUID();
        one(jdbc.update("""
                INSERT INTO ai_turn_usages(id,user_id,shop_id,idempotency_key,request_hash,hash_version,input_conversation_id,
                    window_id,state,execution_fence,lease_owner,lease_expires_at,admitted_at)
                VALUES (?,?,?,?,?,1,?,?,'RESERVED',1,?,?,?)
                """, id, owner, shop, key, hash, conversation, window.id(), UUID.randomUUID(), now.plusSeconds(90), now));
        return usage(id, false).orElseThrow(() -> new IllegalStateException("Reserved usage unavailable"));
    }
    void finish(Usage row, String state, String failure, OffsetDateTime now) {
        one(jdbc.update("""
                UPDATE ai_quota_windows SET reserved_count=reserved_count-1,committed_count=committed_count+?
                WHERE id=? AND reserved_count>0
                """, state.equals("SUCCEEDED") ? 1 : 0, row.window()));
        one(jdbc.update("""
                UPDATE ai_turn_usages SET state=?,failure_code=?,completed_at=GREATEST(?,admitted_at)
                WHERE id=? AND state IN ('RESERVED','RECONCILING') AND execution_fence=? AND lease_owner=?
                """, state, failure, now, row.id(), row.fence(), row.leaseOwner()));
    }
    List<UUID> expired(OffsetDateTime now) {
        return jdbc.query("""
                SELECT id FROM ai_turn_usages WHERE state IN ('RESERVED','RECONCILING') AND lease_expires_at<=?
                ORDER BY lease_expires_at,id LIMIT 20
                """, (rs, row) -> rs.getObject(1, UUID.class), now);
    }
    Usage claim(Usage row, OffsetDateTime now) {
        one(jdbc.update("""
                UPDATE ai_turn_usages SET state='RECONCILING',execution_fence=?,lease_owner=?,lease_expires_at=?
                WHERE id=? AND state IN ('RESERVED','RECONCILING') AND execution_fence=? AND lease_owner=?
                """, Math.addExact(row.fence(), 1), UUID.randomUUID(), now.plusSeconds(90), row.id(), row.fence(), row.leaseOwner()));
        return usage(row.id(), false).orElseThrow(() -> new IllegalStateException("Claimed usage unavailable"));
    }
    private static void one(int count) {
        if (count != 1) throw new IllegalStateException("Quota change was not stored");
    }
}
