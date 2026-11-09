package com.smartledger.core.billing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Bounded durable-pending polling; one request per transaction, safe across instances and restarts. */
@Component
public class SubscriptionFulfillmentWorker {
    private static final Logger log = LoggerFactory.getLogger(SubscriptionFulfillmentWorker.class);
    private final SubscriptionService service;
    private long cursor;
    private long cycleEnd;
    public SubscriptionFulfillmentWorker(SubscriptionService service) { this.service = service; }

    @Scheduled(fixedDelay = 10000, initialDelay = 10000)
    public void run() {
        try {
            if (cycleEnd == 0) {
                cycleEnd = service.latestRequestId();
                if (cycleEnd == 0) return;
            }
            var pending = service.pending(cursor, cycleEnd);
            for (long request : pending) {
                cursor = request;
                try { service.fulfill(request); }
                catch (RuntimeException exception) { log.warn("Subscription fulfillment rolled back; pending payment retained"); }
            }
            // Bound the scan by the IDs present at its start so new arrivals cannot delay retries.
            if (pending.size() < SubscriptionRepository.CANDIDATE_BATCH || cursor == cycleEnd) {
                cursor = 0;
                cycleEnd = 0;
            }
        } catch (RuntimeException exception) { log.warn("Subscription pending scan unavailable; retry on next poll"); }
    }
}
