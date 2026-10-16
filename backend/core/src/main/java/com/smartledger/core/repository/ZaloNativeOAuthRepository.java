package com.smartledger.core.repository;

import com.smartledger.core.zalo.ZaloNativeSession;
import com.smartledger.core.zalo.ZaloPurpose;
import com.smartledger.core.zalo.ZaloStatus;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** No DDL. Requires the separately approved future schema; provider I/O is never inside these transactions. */
@Repository
public class ZaloNativeOAuthRepository {
    private static final String COLUMNS = """
            id,state_hash,browser_binding_hash,purpose,client_request_id,client_challenge,verifier_ciphertext,
            status,provider_subject,display_name,created_at,expires_at,provider_app_id,native_client_id,return_target_id
            """;
    private static final RowMapper<ZaloNativeSession> MAPPER = (row, index) -> new ZaloNativeSession(
            row.getObject("id", UUID.class), row.getString("state_hash"), row.getString("browser_binding_hash"),
            ZaloPurpose.valueOf(row.getString("purpose")), row.getString("client_request_id"), row.getString("client_challenge"),
            row.getString("verifier_ciphertext"), ZaloStatus.valueOf(row.getString("status")), row.getString("provider_subject"),
            row.getString("display_name"), row.getObject("created_at", OffsetDateTime.class), row.getObject("expires_at", OffsetDateTime.class),
            row.getString("provider_app_id"), row.getString("native_client_id"), row.getString("return_target_id"));
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;

    public ZaloNativeOAuthRepository(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        transactions = new TransactionTemplate(manager);
        transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transactions.setTimeout(10);
    }

    /** PostgreSQL row-to-JSON tolerates the absent column on V17, preserving existing WEB callbacks. */
    public boolean isAndroid(String stateHash) {
        return committed(() -> !jdbc.queryForList("""
                select id from oauth_login_sessions s where state_hash=? and to_jsonb(s)->>'client_type'='ANDROID'
                """, UUID.class, stateHash).isEmpty());
    }

    public void requireSchema() {
        committed(() -> {
            jdbc.queryForList("select client_type,native_client_id,return_target_id,handoff_reference_hash,handoff_expires_at from oauth_login_sessions where false");
            return null;
        });
    }

    public void insert(ZaloNativeSession session) {
        committed(() -> {
            jdbc.update("""
                    insert into oauth_login_sessions
                    (id,state_hash,browser_binding_hash,purpose,client_request_id,client_challenge,verifier_ciphertext,
                     status,created_at,expires_at,provider_app_id,client_type,native_client_id,return_target_id,client_origin)
                    values (?,?,?,?,?,?,?,'PENDING',?,?,?,'ANDROID',?,?,null)
                    """, session.id(), session.stateHash(), session.browserBindingHash(), session.purpose().name(),
                    session.requestId(), session.clientChallenge(), session.verifierCiphertext(), session.createdAt(),
                    session.expiresAt(), session.providerAppId(), session.nativeClientId(), session.returnTargetId());
            return null;
        });
    }

    public Optional<ZaloNativeSession> claimCallback(String stateHash, String bindingHash, String appId,
            String clientId, String targetId, OffsetDateTime now) {
        return committed(() -> jdbc.query("""
                update oauth_login_sessions set status='EXCHANGING'
                where state_hash=? and browser_binding_hash=? and provider_app_id=? and native_client_id=?
                    and return_target_id=? and client_type='ANDROID' and client_origin is null
                    and status='PENDING' and expires_at>? returning
                """ + COLUMNS, MAPPER, stateHash, bindingHash, appId, clientId, targetId, now).stream().findFirst());
    }

    public boolean markVerified(UUID id, String subject, String displayName, String referenceHash,
            OffsetDateTime expiry, OffsetDateTime now) {
        return committed(() -> jdbc.update("""
                update oauth_login_sessions set status='VERIFIED',provider_subject=?,display_name=?,
                    handoff_reference_hash=?,handoff_expires_at=?,verifier_ciphertext=null
                where id=? and client_type='ANDROID' and client_origin is null and proof_hash is null
                    and status='EXCHANGING' and expires_at>? and ?>? and ?<=expires_at
                """, subject, displayName, referenceHash, expiry, id, now, expiry, now, expiry) == 1);
    }

    public Optional<ZaloNativeSession> consume(String referenceHash, ZaloPurpose purpose, String clientId,
            String requestId, String challenge, String appId, String targetId, OffsetDateTime now) {
        return committed(() -> jdbc.query("""
                update oauth_login_sessions set status='CONSUMED',handoff_reference_hash=null,
                    handoff_expires_at=null,verifier_ciphertext=null,completed_at=?
                where handoff_reference_hash=? and purpose=? and native_client_id=? and client_request_id=?
                    and client_challenge=? and provider_app_id=? and return_target_id=? and client_type='ANDROID'
                    and client_origin is null and proof_hash is null and status='VERIFIED'
                    and expires_at>? and handoff_expires_at>? returning
                """ + COLUMNS, MAPPER, now, referenceHash, purpose.name(), clientId, requestId, challenge, appId, targetId, now, now)
                .stream().findFirst());
    }

    private <T> T committed(Supplier<T> action) { return transactions.execute(status -> action.get()); }
}
