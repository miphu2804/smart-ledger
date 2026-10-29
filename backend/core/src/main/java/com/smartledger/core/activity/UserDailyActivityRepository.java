package com.smartledger.core.activity;

import java.time.LocalDate;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Small committed writes, independent of the business transaction and any read-only persistence context. */
public class UserDailyActivityRepository {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;

    public UserDailyActivityRepository(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        transaction = new TransactionTemplate(manager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.setTimeout(2);
    }

    /** Resolves a verified Firebase UID to a current ACTIVE Core user, never to an email or caller-supplied ID. */
    public Optional<Long> findActiveUserId(String uid) {
        return jdbc.query("""
                SELECT u.id FROM users u JOIN auth_identities a ON a.user_id=u.id
                WHERE a.provider='FIREBASE' AND a.provider_subject=? AND u.status='ACTIVE'
                """, (row, index) -> row.getLong(1), uid).stream().findFirst();
    }

    /** Returns only after commit; duplicate days are harmless across instances and restarts. */
    public boolean insertActiveDay(long userId, LocalDate date) {
        return Boolean.TRUE.equals(transaction.execute(status -> {
            // Keep status stable until commit, including a concurrent disable/delete after UID resolution.
            var active = jdbc.query("SELECT id FROM users WHERE id=? AND status='ACTIVE' FOR SHARE",
                    (row, index) -> row.getLong(1), userId);
            if (active.isEmpty()) { return false; }
            jdbc.update("""
                    INSERT INTO user_daily_activity(user_id, activity_date) VALUES (?, ?)
                    ON CONFLICT (user_id, activity_date) DO NOTHING
                    """, userId, date);
            return true;
        }));
    }

    /** Removes dates before the inclusive 90-day window; no change to users or their business data. */
    public int deleteBefore(LocalDate cutoff) {
        Integer count = transaction.execute(status -> jdbc.update(
                "DELETE FROM user_daily_activity WHERE activity_date < ?", cutoff));
        return count == null ? 0 : count;
    }
}
