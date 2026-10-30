package com.smartledger.core.activity;

import org.springframework.scheduling.annotation.Scheduled;

/** Retention is independent of user traffic, and only runs when daily activity is enabled. */
public class UserDailyActivityCleanup {
    private final UserDailyActivityService service;
    public UserDailyActivityCleanup(UserDailyActivityService service) { this.service = service; }

    @Scheduled(fixedDelay = 3_600_000L, initialDelay = 60_000L)
    public void cleanup() { service.cleanup(); }
}
