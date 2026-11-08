package com.smartledger.core.billing;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Verifies raw bytes, serializes provider identity and commits money plus pending fulfillment atomically. */
@Service
public class SePayWebhookService {
    private final BillingRepository repository;
    private final BillingProperties properties;
    private final BillingJson json;
    private final Clock clock;
    private final TransactionTemplate transaction;

    public SePayWebhookService(BillingRepository repository, BillingProperties properties, BillingJson json,
            @Qualifier("billingClock") Clock clock, PlatformTransactionManager manager) {
        this.repository = repository; this.properties = properties; this.json = json; this.clock = clock;
        this.transaction = new TransactionTemplate(manager);
        this.transaction.setTimeout(5);
    }

    /** Returning normally means the transaction committed, including duplicates or review outcomes. */
    public void accept(String integration, String timestamp, String signature, byte[] rawBody) {
        if (!properties.webhookReady()) throw new SePayFailure(503);
        if (!properties.integrationKey().equals(integration)) throw new SePayFailure(401);
        verify(timestamp, signature, rawBody);
        var received = OffsetDateTime.ofInstant(clock.instant().truncatedTo(ChronoUnit.MICROS), ZoneOffset.UTC);
        var payload = SePayPayload.parse(json, rawBody);
        transaction.executeWithoutResult(status -> {
            repository.deadlines();
            // The immutable outcome cannot be inserted as PENDING and updated later. Reserve its identity
            // with a transaction-scoped advisory lock; the UNIQUE key remains the durable final guard.
            repository.lockProvider(integration, payload.providerId());
            var prior = repository.receivedHash(integration, payload.providerId());
            if (prior.isPresent()) {
                if (!prior.get().equals(payload.fingerprint())) throw new SePayFailure(409);
                return;
            }
            var request = repository.lockCode(integration, payload.code()).orElse(null);
            String disposition = "REVIEW_REQUIRED";
            String reason = payload.codeReason();
            if (payload.direction().equals("OUT")) { disposition = "IGNORED_OUTGOING"; reason = "OUTGOING"; }
            else if (request == null && payload.code() != null) reason = "UNKNOWN_CODE";
            else if (request != null) {
                if (request.status().equals("PAID")) reason = "EXTRA_TRANSFER";
                else if (!payload.bank().equalsIgnoreCase(request.bank()) || !payload.account().equals(request.account())
                        || payload.subAccount() != null) reason = "RECIPIENT_MISMATCH";
                else if (payload.amount() != request.amount()) reason = "AMOUNT_MISMATCH";
                else if (received.isBefore(request.created()) || !received.isBefore(request.expires())) reason = "LATE_RECEIPT";
                else { disposition = "ACCEPTED"; reason = "MATCHED"; }
            }
            repository.bank(integration, payload, received, request, disposition, reason);
            if (disposition.equals("ACCEPTED")) repository.paid(request.id(), received);
        });
    }

    private void verify(String timestamp, String signature, byte[] rawBody) {
        if (timestamp == null || !timestamp.matches("[0-9]{1,12}") || signature == null
                || !signature.matches("sha256=[a-f0-9]{64}")
                || Math.abs(clock.instant().getEpochSecond() - Long.parseLong(timestamp)) > 300) throw new SePayFailure(401);
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(properties.webhookSecret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            mac.update((timestamp + ".").getBytes(StandardCharsets.US_ASCII));
            byte[] expected = mac.doFinal(rawBody);
            if (!MessageDigest.isEqual(expected, HexFormat.of().parseHex(signature.substring(7)))) throw new SePayFailure(401);
        } catch (GeneralSecurityException exception) { throw new SePayFailure(503); }
    }
}
