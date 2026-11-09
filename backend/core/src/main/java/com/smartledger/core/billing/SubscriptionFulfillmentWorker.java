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
    /** Full batches scanned before the cursor wraps, so a steady inflow cannot postpone old retries forever. */
    static final int MAX_FULL_BATCHES = 6;
    private long cursor;
    private int fullBatches;
    public SubscriptionFulfillmentWorker(SubscriptionService service) { this.service = service; }

    @Scheduled(fixedDelay = 10000, initialDelay = 10000)
    public void run() {
        try {
            var pending = service.pending(cursor);
            for (long request : pending) {
                cursor = request;
                try { service.fulfill(request); }
                catch (RuntimeException exception) { log.warn("Subscription fulfillment rolled back; pending payment retained"); }
            }
            // A short batch reached the newest payment: start over so failed older payments retry next poll.
            if (pending.size() < SubscriptionRepository.CANDIDATE_BATCH || ++fullBatches >= MAX_FULL_BATCHES) {
                cursor = 0;
                fullBatches = 0;
            }
        } catch (RuntimeException exception) { log.warn("Subscription pending scan unavailable; retry on next poll"); }
    }
}
