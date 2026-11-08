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
    public SubscriptionFulfillmentWorker(SubscriptionService service) { this.service = service; }

    @Scheduled(fixedDelay = 10000, initialDelay = 10000)
    public void run() {
        try {
            var pending = service.pending(cursor);
            if (pending.isEmpty()) cursor = 0;
            for (long request : pending) {
                cursor = request;
                try { service.fulfill(request); }
                catch (RuntimeException exception) { log.warn("Subscription fulfillment rolled back; pending payment retained"); }
            }
        } catch (RuntimeException exception) { log.warn("Subscription pending scan unavailable; retry on next poll"); }
    }
}
