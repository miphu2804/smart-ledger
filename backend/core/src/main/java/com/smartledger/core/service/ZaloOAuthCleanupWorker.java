package com.smartledger.core.service;

import com.smartledger.core.exception.BusinessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "zalo", name = "enabled", havingValue = "true")
public class ZaloOAuthCleanupWorker {
    private static final Logger log = LoggerFactory.getLogger(ZaloOAuthCleanupWorker.class);
    private final ZaloAuthService service;
    public ZaloOAuthCleanupWorker(ZaloAuthService service) { this.service = service; }

    @Scheduled(fixedDelayString = "${zalo.cleanup-delay-ms:60000}", initialDelayString = "${zalo.cleanup-delay-ms:60000}")
    public void cleanup() {
        try { service.cleanupExpiredSessions(); }
        catch (BusinessException failure) { log.warn("Zalo session cleanup unavailable; no provider request was made."); }
    }
}
