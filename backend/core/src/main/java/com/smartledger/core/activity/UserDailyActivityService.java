package com.smartledger.core.activity;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.ReentrantLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Best-effort daily telemetry: bounded cache, no identity/status cache and no credential logging. */
public class UserDailyActivityService {
    public static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    public static final int RETENTION_DAYS = 90;
    private static final Logger log = LoggerFactory.getLogger(UserDailyActivityService.class);
    private final UserDailyActivityRepository repository;
    private final Clock clock;
    private final int maximumEntries;
    private final Map<Day, Boolean> recorded = new LinkedHashMap<>();
    private final ReentrantLock[] locks = new ReentrantLock[64];
    private final AtomicLong nextWarning = new AtomicLong();
    private LocalDate cacheDate;

    public UserDailyActivityService(UserDailyActivityRepository repository, Clock clock, int maximumEntries) {
        if (maximumEntries < 1 || maximumEntries > 100_000) {
            throw new IllegalArgumentException("User activity cache size must be between 1 and 100000");
        }
        this.repository = repository;
        this.clock = clock;
        this.maximumEntries = maximumEntries;
        for (int i = 0; i < locks.length; i++) { locks[i] = new ReentrantLock(); }
    }

    /** The date belongs to request admission in Vietnam, including requests completing after midnight. */
    public LocalDate today() { return LocalDate.now(clock.withZone(ZONE)); }

    /** Failed writes never populate the cache; the next eligible request can retry. */
    public void record(String firebaseUid, LocalDate date) {
        try {
            LocalDate today = today();
            if (date.isAfter(today) || date.isBefore(today.minusDays(RETENTION_DAYS - 1L))) { return; }
            Long userId = repository.findActiveUserId(firebaseUid).orElse(null);
            if (userId == null) { return; }
            Day key = new Day(userId, date);
            ReentrantLock lock = locks[Math.floorMod(Long.hashCode(userId), locks.length)];
            lock.lock();
            try {
                synchronized (recorded) {
                    if (!today.equals(cacheDate)) { recorded.clear(); cacheDate = today; }
                    if (recorded.containsKey(key)) { return; }
                }
                if (repository.insertActiveDay(userId, date)) {
                    synchronized (recorded) {
                        recorded.put(key, Boolean.TRUE);
                        while (recorded.size() > maximumEntries) { recorded.remove(recorded.keySet().iterator().next()); }
                    }
                }
            } finally { lock.unlock(); }
        } catch (RuntimeException failure) {
            warnUnavailable();
        }
    }

    /** Hourly cleanup is retryable and cannot stop request handling. */
    public void cleanup() {
        try { repository.deleteBefore(today().minusDays(RETENTION_DAYS - 1L)); }
        catch (RuntimeException failure) { warnUnavailable(); }
    }

    private void warnUnavailable() {
        long now = clock.millis();
        long next = nextWarning.get();
        if (now >= next && nextWarning.compareAndSet(next, now + 60_000L)) {
            log.warn("user_daily_activity_unavailable; business response unchanged; next eligible request may retry");
        }
    }

    private record Day(long userId, LocalDate date) { }
}
