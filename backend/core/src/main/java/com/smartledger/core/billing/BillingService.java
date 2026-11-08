package com.smartledger.core.billing;

import com.fasterxml.jackson.databind.JsonNode;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import java.io.IOException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.util.UriComponentsBuilder;

/** Creates immutable OWNER requests; payment acceptance does not activate a subscription. */
@Service
public class BillingService {
    private static final char[] CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".toCharArray();
    private final SecureRandom random = new SecureRandom();
    private final BillingRepository repository;
    private final BillingProperties properties;
    private final BillingJson json;
    private final Clock clock;
    private final TransactionTemplate transaction;

    public BillingService(BillingRepository repository, BillingProperties properties, BillingJson json,
            @Qualifier("billingClock") Clock clock, PlatformTransactionManager manager) {
        this.repository = repository; this.properties = properties; this.json = json; this.clock = clock;
        this.transaction = new TransactionTemplate(manager);
        this.transaction.setTimeout(5);
    }

    /** Catalog remains readable with creation disabled and never requires a shop. */
    public List<BillingPlanResponse> plans(VerifiedFirebaseToken token) {
        return inTransaction(() -> { repository.owner(token.uid(), false); return BillingPlanResponse.catalog(); });
    }

    /** A valid old key is resolved before current offer/configuration availability. */
    public BillingPaymentResponse create(VerifiedFirebaseToken token, String rawKey, byte[] body) {
        String key = rawKey == null ? "" : rawKey.strip();
        if (key.isBlank() || key.length() > 255) throw new BusinessException(ErrorCode.INVALID_BILLING_REQUEST);
        JsonNode input;
        try { input = json.read(body); }
        catch (IOException exception) { throw new BusinessException(ErrorCode.INVALID_BILLING_REQUEST); }
        if (input == null || !input.isObject() || input.size() != 2 || !input.path("planCode").isTextual()
                || !input.path("planVersion").isIntegralNumber() || !input.path("planVersion").canConvertToInt()
                || input.path("planCode").textValue().length() > 32 || input.path("planVersion").intValue() <= 0) {
            throw new BusinessException(ErrorCode.INVALID_BILLING_REQUEST);
        }
        String code = input.path("planCode").textValue();
        int version = input.path("planVersion").intValue();
        String hash = json.fingerprint(code, version);
        return inTransaction(() -> {
            long owner = repository.owner(token.uid(), true);
            var replay = repository.replay(owner, key);
            if (replay.isPresent()) {
                if (!replay.get().hash().equals(hash)) throw new BusinessException(ErrorCode.BILLING_IDEMPOTENCY_CONFLICT);
                return json.snapshot(replay.get().originalResponse());
            }
            properties.requireCreationReady();
            var plan = BillingPlanResponse.catalog().stream().filter(p -> p.planCode().equals(code)
                    && p.version() == version && p.durationMonths() != null).findFirst()
                    .orElseThrow(() -> new BusinessException(ErrorCode.BILLING_OFFER_UNAVAILABLE));
            long id = repository.nextRequestId();
            var now = OffsetDateTime.ofInstant(clock.instant().truncatedTo(ChronoUnit.MICROS), ZoneOffset.UTC);
            var recipient = new BillingPaymentResponse.Recipient(properties.recipientBankCode(),
                    properties.recipientAccountNumber(), properties.recipientAccountName().strip());
            for (int attempt = 0; attempt < 5; attempt++) {
                String paymentCode = paymentCode();
                String qr = UriComponentsBuilder.fromUriString("https://vietqr.app/img")
                        .queryParam("acc", recipient.accountNumber()).queryParam("bank", recipient.bankCode())
                        .queryParam("amount", plan.amountVnd()).queryParam("des", paymentCode).build().encode().toUriString();
                var response = new BillingPaymentResponse(id, code, version, plan.amountVnd(), "VND", plan.durationMonths(),
                        1, paymentCode, "PENDING", false, "NOT_STARTED", now, now.plusMinutes(30), null, recipient, qr);
                if (repository.create(owner, properties.integrationKey(), key, hash, response, json.write(response))) return response;
            }
            throw new BusinessException(ErrorCode.BILLING_UNAVAILABLE);
        });
    }

    /** Expiry is a read projection, so a GET cannot invalidate a pre-deadline in-flight webhook. */
    public BillingPaymentResponse get(VerifiedFirebaseToken token, long id) {
        if (id <= 0) throw new BusinessException(ErrorCode.INVALID_BILLING_REQUEST);
        return inTransaction(() -> {
            long owner = repository.owner(token.uid(), false);
            var row = repository.owned(owner, id).orElseThrow(() -> new BusinessException(ErrorCode.BILLING_REQUEST_NOT_FOUND));
            String status = "PAID".equals(row.status()) ? "PAID" : !clock.instant().isBefore(row.expires().toInstant()) ? "EXPIRED" : "PENDING";
            return json.snapshot(row.originalResponse()).current(status, row.review(), row.fulfillment(), row.paid());
        });
    }

    private String paymentCode() {
        var result = new StringBuilder("SLP");
        for (int i = 0; i < 12; i++) result.append(CODE_ALPHABET[random.nextInt(CODE_ALPHABET.length)]);
        return result.toString();
    }

    private <T> T inTransaction(java.util.function.Supplier<T> operation) {
        try { return transaction.execute(status -> { repository.deadlines(); return operation.get(); }); }
        catch (DataAccessException exception) { throw new BusinessException(ErrorCode.BILLING_UNAVAILABLE); }
        catch (org.springframework.transaction.TransactionException exception) { throw new BusinessException(ErrorCode.BILLING_UNAVAILABLE); }
    }
}
