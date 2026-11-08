package com.smartledger.core.billing;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

/** Parameterized billing storage; callers supply the encompassing transaction. */
@Repository
public class BillingRepository {
    private final JdbcTemplate jdbc;
    public BillingRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Request(long id, long owner, String integration, String hash, String originalResponse,
            String code, long amount, String bank, String account, String status, String fulfillment,
            OffsetDateTime created, OffsetDateTime expires, OffsetDateTime paid, boolean review) {}

    private static final String SELECT_REQUEST = """
            SELECT r.*, EXISTS(SELECT 1 FROM billing_bank_transactions b WHERE b.matched_request_id=r.id
                AND b.disposition='REVIEW_REQUIRED') AS review_required FROM billing_payment_requests r
            """;
    private static final RowMapper<Request> REQUEST = (rs, row) -> new Request(rs.getLong("id"), rs.getLong("payer_user_id"),
            rs.getString("integration_key"), rs.getString("request_hash"), rs.getString("original_response"),
            rs.getString("payment_code"), rs.getLong("amount_vnd"), rs.getString("recipient_bank_code"),
            rs.getString("recipient_account_number"), rs.getString("status"), rs.getString("fulfillment_status"),
            rs.getObject("created_at", OffsetDateTime.class), rs.getObject("expires_at", OffsetDateTime.class),
            rs.getObject("paid_at", OffsetDateTime.class), rs.getBoolean("review_required"));

    void deadlines() {
        jdbc.execute("SET LOCAL lock_timeout = '2s'");
        jdbc.execute("SET LOCAL statement_timeout = '3s'");
    }

    long owner(String uid, boolean serializeCreation) {
        var rows = jdbc.query("""
                SELECT u.id,u.status,u.system_role FROM users u JOIN auth_identities a ON a.user_id=u.id
                WHERE a.provider_subject=? AND a.provider='FIREBASE'
                """ + (serializeCreation ? " FOR UPDATE OF u" : " FOR SHARE OF u"), (rs, row) -> {
            if (!"ACTIVE".equals(rs.getString("status"))) throw new BusinessException(ErrorCode.ACCOUNT_DISABLED);
            if (!"OWNER".equals(rs.getString("system_role"))) throw new BusinessException(ErrorCode.SHOP_ACCESS_DENIED);
            return rs.getLong("id");
        }, uid);
        if (rows.isEmpty()) throw new BusinessException(ErrorCode.AUTH_PROFILE_NOT_FOUND);
        return rows.getFirst();
    }

    Optional<Request> replay(long user, String key) {
        return jdbc.query(SELECT_REQUEST + " WHERE r.payer_user_id=? AND r.idempotency_key=?", REQUEST, user, key).stream().findFirst();
    }
    Optional<Request> owned(long user, long id) {
        return jdbc.query(SELECT_REQUEST + " WHERE r.payer_user_id=? AND r.id=?", REQUEST, user, id).stream().findFirst();
    }
    Optional<Request> lockCode(String integration, String code) {
        if (code == null) return Optional.empty();
        return jdbc.query(SELECT_REQUEST + " WHERE r.integration_key=? AND r.payment_code=? FOR UPDATE OF r",
                REQUEST, integration, code).stream().findFirst();
    }
    long nextRequestId() { return jdbc.queryForObject("SELECT nextval(pg_get_serial_sequence('billing_payment_requests','id'))", Long.class); }

    boolean create(long user, String integration, String key, String hash, BillingPaymentResponse response, String snapshot) {
        return jdbc.update("""
                INSERT INTO billing_payment_requests(id,payer_user_id,integration_key,plan_code,plan_version,duration_months,
                    quota_policy_version,amount_vnd,currency,recipient_bank_code,recipient_account_number,recipient_account_name,
                    payment_code,idempotency_key,request_hash,hash_version,original_response,created_at,expires_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?::jsonb,?,?) ON CONFLICT DO NOTHING
                """, response.id(), user, integration, response.planCode(), response.planVersion(), response.durationMonths(),
                response.quotaPolicyVersion(), response.amountVnd(), response.currency(), response.recipient().bankCode(),
                response.recipient().accountNumber(), response.recipient().accountName(), response.paymentCode(), key, hash,
                snapshot, response.createdAt(), response.expiresAt()) == 1;
    }

    void lockProvider(String integration, String providerId) {
        String hash = BillingJson.sha256((integration + "\0" + providerId).getBytes(StandardCharsets.UTF_8));
        long key = ByteBuffer.wrap(HexFormat.of().parseHex(hash.substring(0, 16))).getLong();
        jdbc.queryForObject("SELECT pg_advisory_xact_lock(?)", (rs, row) -> Boolean.TRUE, key);
    }
    Optional<String> receivedHash(String integration, String providerId) {
        return jdbc.query("SELECT financial_hash FROM billing_bank_transactions WHERE integration_key=? AND provider_transaction_id=?",
                (rs, row) -> rs.getString(1), integration, providerId).stream().findFirst();
    }
    void bank(String integration, SePayPayload payload, OffsetDateTime received, Request request,
            String disposition, String reason) {
        int inserted = jdbc.update("""
                INSERT INTO billing_bank_transactions(integration_key,provider_transaction_id,first_received_at,bank_occurred_at,
                    direction,amount_vnd,bank_code,account_number,sub_account,payment_code,matched_request_id,payer_user_id,
                    disposition,reason,financial_hash,hash_version)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
                """, integration, payload.providerId(), received, payload.bankTime(), payload.direction(), payload.amount(),
                payload.bank(), payload.account(), payload.subAccount(), payload.code(), request == null ? null : request.id(),
                request == null ? null : request.owner(), disposition, reason, payload.fingerprint());
        if (inserted != 1) throw new IllegalStateException("Bank receipt could not be committed");
    }
    void paid(long request, OffsetDateTime received) {
        int updated = jdbc.update("UPDATE billing_payment_requests SET status='PAID',paid_at=?,fulfillment_status='PENDING' WHERE id=?", received, request);
        if (updated != 1) throw new IllegalStateException("Payment state could not be committed");
    }
}
