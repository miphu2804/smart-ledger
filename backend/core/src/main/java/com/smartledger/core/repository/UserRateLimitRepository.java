package com.smartledger.core.repository;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.ratelimit.RateLimitExceededException;
import com.smartledger.core.ratelimit.RateLimitPolicy;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** SQL only; all callers must hold a transaction. PostgreSQL is the shared quota clock and store. */
@Repository
public class UserRateLimitRepository {
    private final JdbcTemplate jdbc;
    public UserRateLimitRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private void lock(long userId, RateLimitPolicy policy) {
        // All quota writers take this lock before media/user/shop rows; waiting callers hold no user row lock.
        jdbc.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?,0))",
                "core19:" + policy.name() + ":" + userId);
    }

    public UUID touch(long userId, RateLimitPolicy policy) {
        lock(userId, policy);
        OffsetDateTime now = now();
        var windows = jdbc.query("""
                SELECT id FROM user_rate_limit_windows WHERE user_id=? AND group_key=? AND ends_at>?
                ORDER BY started_at DESC LIMIT 1
                """, (rs, n) -> rs.getObject(1, UUID.class), userId, policy.name(), now);
        if (!windows.isEmpty()) return windows.getFirst();
        UUID id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO user_rate_limit_windows(id,user_id,group_key,started_at,ends_at)
                VALUES (?,?,?,?,?)
                """, id, userId, policy.name(), now, now.plusSeconds(policy.seconds()));
        return id;
    }

    public void reserve(long userId, RateLimitPolicy policy, UUID token, int leaseSeconds) {
        UUID window = touch(userId, policy);
        OffsetDateTime now = now();
        jdbc.update("""
                UPDATE user_rate_limit_reservations SET status='RELEASED',completed_at=?
                WHERE window_id=? AND status='PENDING' AND lease_expires_at<=?
                """, now, window, now);
        int success = jdbc.queryForObject("SELECT successful_count FROM user_rate_limit_windows WHERE id=?",
                Integer.class, window);
        int pending = jdbc.queryForObject("""
                SELECT count(*) FROM user_rate_limit_reservations WHERE window_id=? AND status='PENDING'
                """, Integer.class, window);
        if (success + pending >= policy.limit()) {
            OffsetDateTime until = jdbc.queryForObject("SELECT ends_at FROM user_rate_limit_windows WHERE id=?",
                    OffsetDateTime.class, window);
            if (success < policy.limit()) {
                OffsetDateTime lease = jdbc.queryForObject("""
                        SELECT min(lease_expires_at) FROM user_rate_limit_reservations
                        WHERE window_id=? AND status='PENDING'
                        """, OffsetDateTime.class, window);
                if (lease != null && lease.isBefore(until)) until = lease;
            }
            throw new RateLimitExceededException(Math.max(1, (Duration.between(now, until).toMillis() + 999) / 1000));
        }
        jdbc.update("""
                INSERT INTO user_rate_limit_reservations(id,window_id,lease_token,lease_expires_at,created_at)
                VALUES (?,?,?,?,?)
                """, UUID.randomUUID(), window, token, now.plusSeconds(leaseSeconds), now);
    }

    public void complete(long userId, RateLimitPolicy policy, UUID token) {
        lock(userId, policy);
        var windows = jdbc.query("""
                SELECT r.window_id FROM user_rate_limit_reservations r
                JOIN user_rate_limit_windows w ON w.id=r.window_id
                WHERE r.lease_token=? AND w.user_id=? AND w.group_key=?
                    AND r.status='PENDING' AND r.lease_expires_at>clock_timestamp()
                FOR UPDATE OF r
                """, (rs, n) -> rs.getObject(1, UUID.class), token, userId, policy.name());
        if (windows.isEmpty()) throw new BusinessException(ErrorCode.RATE_LIMIT_RESERVATION_EXPIRED);
        int updated = jdbc.update("""
                UPDATE user_rate_limit_windows SET successful_count=successful_count+1
                WHERE id=? AND successful_count<?
                """, windows.getFirst(), policy.limit());
        if (updated != 1) throw new IllegalStateException("Reserved quota invariant violated");
        jdbc.update("""
                UPDATE user_rate_limit_reservations SET status='COMMITTED',completed_at=clock_timestamp()
                WHERE lease_token=? AND status='PENDING'
                """, token);
    }

    public void release(long userId, RateLimitPolicy policy, UUID token) {
        lock(userId, policy);
        jdbc.update("""
                UPDATE user_rate_limit_reservations r SET status='RELEASED',completed_at=clock_timestamp()
                FROM user_rate_limit_windows w WHERE r.window_id=w.id AND w.user_id=? AND w.group_key=?
                    AND r.lease_token=? AND r.status='PENDING'
                """, userId, policy.name(), token);
    }

    public void cleanup() {
        // Never delete an active bucket or a still-live upload lease. FK CASCADE removes terminal receipts.
        jdbc.update("""
                DELETE FROM user_rate_limit_windows w WHERE ends_at<clock_timestamp()-interval '1 day'
                AND NOT EXISTS (SELECT 1 FROM user_rate_limit_reservations r WHERE r.window_id=w.id
                    AND r.status='PENDING' AND r.lease_expires_at>clock_timestamp())
                """);
    }

    private OffsetDateTime now() {
        return jdbc.queryForObject("SELECT clock_timestamp()", OffsetDateTime.class);
    }
}
