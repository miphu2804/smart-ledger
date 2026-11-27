package com.smartledger.core.billing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Claims expired work with a new fence; never refunds a lease age or starts another generation. */
@Component
public class ChatQuotaRecovery {
    private static final Logger log = LoggerFactory.getLogger(ChatQuotaRecovery.class);
    private final ChatQuotaLedger ledger;
    private final ChatQuotaService service;
    public ChatQuotaRecovery(ChatQuotaLedger ledger, ChatQuotaService service) { this.ledger = ledger; this.service = service; }
    @Scheduled(fixedDelay = 10000, initialDelay = 10000)
    public void run() {
        try {
            for (var id : ledger.expired()) {
                try { var claimed = ledger.claim(id); if (claimed != null) service.recover(claimed); }
                catch (RuntimeException exception) { log.warn("AI quota recovery retained pending work"); }
            }
        } catch (RuntimeException exception) { log.warn("AI quota recovery store unavailable"); }
    }
}
