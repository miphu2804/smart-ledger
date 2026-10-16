package com.smartledger.core.repository;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.zalo.ZaloOAuthSession;
import com.smartledger.core.zalo.ZaloPurpose;
import com.smartledger.core.zalo.ZaloStatus;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Short, committed JDBC operations. No provider HTTP call may run inside these transactions.
 *
 * <p>No JPA entity or startup query is registered for the V17 stores: disabled Zalo remains
 * compatible with V16 during the staged rollout.</p>
 */
@Repository
public class ZaloOAuthRepository {
    private static final String SESSION_COLUMNS = """
            id, state_hash, browser_binding_hash, purpose, client_origin, client_request_id,
            client_challenge, verifier_ciphertext, status, provider_subject, display_name,
            proof_hash, created_at, expires_at, proof_expires_at, completed_at, provider_app_id
            """;
    private static final RowMapper<ZaloOAuthSession> SESSION_MAPPER = ZaloOAuthRepository::session;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;

    public ZaloOAuthRepository(JdbcTemplate jdbc, PlatformTransactionManager transactions) {
        this.jdbc = jdbc;
        this.transactions = new TransactionTemplate(transactions);
        this.transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.transactions.setTimeout(10);
    }

    public void insert(ZaloOAuthSession session) {
        committed(() -> {
            jdbc.update("insert into oauth_login_sessions (" + SESSION_COLUMNS + ") values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    session.id(), session.stateHash(), session.browserBindingHash(), session.purpose().name(),
                    session.clientOrigin(), session.clientRequestId(), session.clientChallenge(), session.verifierCiphertext(),
                    session.status().name(), session.providerSubject(), session.displayName(), session.proofHash(),
                    session.createdAt(), session.expiresAt(), session.proofExpiresAt(), session.completedAt(), session.providerAppId());
            return null;
        });
    }

    public Optional<ZaloOAuthSession> findByStateHash(String stateHash) {
        return committed(() -> first(jdbc.query("select " + SESSION_COLUMNS + " from oauth_login_sessions where state_hash=?",
                SESSION_MAPPER, stateHash)));
    }

    public Optional<ZaloOAuthSession> claimCallback(String stateHash, String bindingHash, OffsetDateTime now) {
        return committed(() -> first(jdbc.query("""
                update oauth_login_sessions set status='EXCHANGING'
                where state_hash=? and browser_binding_hash=? and status='PENDING' and expires_at>?
                returning
                """ + SESSION_COLUMNS, SESSION_MAPPER, stateHash, bindingHash, now)));
    }

    public boolean markVerified(UUID id, String subject, String displayName, String proofHash,
            OffsetDateTime proofExpiresAt, OffsetDateTime now) {
        return committed(() -> jdbc.update("""
                update oauth_login_sessions
                set status='VERIFIED',provider_subject=?,display_name=?,proof_hash=?,proof_expires_at=?,verifier_ciphertext=null
                where id=? and status='EXCHANGING' and expires_at>? and ?>? and ?<=expires_at
                """, subject, displayName, proofHash, proofExpiresAt, id, now, proofExpiresAt, now, proofExpiresAt) == 1);
    }

    public void fail(UUID id, OffsetDateTime now) {
        committed(() -> {
            jdbc.update("""
                    update oauth_login_sessions
                    set status='FAILED',verifier_ciphertext=null,provider_subject=null,display_name=null,
                        proof_hash=null,proof_expires_at=null,completed_at=?
                    where id=? and status in ('PENDING','EXCHANGING')
                    """, now, id);
            return null;
        });
    }

    public Optional<ZaloOAuthSession> consumeProof(String proofHash, ZaloPurpose purpose, String origin,
            String clientChallenge, OffsetDateTime now) {
        return committed(() -> first(jdbc.query("""
                update oauth_login_sessions
                set status='CONSUMED',proof_hash=null,verifier_ciphertext=null,completed_at=?
                where proof_hash=? and purpose=? and client_origin=? and client_challenge=?
                  and status='VERIFIED' and expires_at>? and proof_expires_at>?
                returning
                """ + SESSION_COLUMNS, SESSION_MAPPER, now, proofHash, purpose.name(), origin, clientChallenge, now, now)));
    }

    /** Concurrent first logins reserve one canonical UID before Firebase provisioning. */
    public String resolveLoginUid(String appId, String subject, String candidateUid, OffsetDateTime now) {
        return committed(() -> {
            String uid = reserveAndReadUid(appId, subject, candidateUid, now);
            requireAccount(uid, false);
            return uid;
        });
    }

    /** A conflicting identity is never moved, and the target account is freshly locked before commit. */
    public void linkIdentity(String appId, String subject, String targetUid, OffsetDateTime now) {
        committed(() -> {
            // Keep mapping -> User lock order identical to login; do not invert it for linking.
            String uid = reserveAndReadUid(appId, subject, targetUid, now);
            if (!uid.equals(targetUid)) throw new BusinessException(ErrorCode.ZALO_IDENTITY_CONFLICT);
            requireAccount(targetUid, true);
            return null;
        });
    }

    public boolean checkAccount(String uid, boolean requireProfile) {
        return committed(() -> requireAccount(uid, requireProfile));
    }

    public int cleanup(OffsetDateTime now) {
        return committed(() -> jdbc.update("delete from oauth_login_sessions where expires_at<=?", now));
    }

    private String reserveAndReadUid(String appId, String subject, String candidateUid, OffsetDateTime now) {
        jdbc.update("""
                insert into external_auth_identities
                    (provider,provider_app_id,provider_subject,firebase_uid,created_at,updated_at)
                values ('ZALO',?,?,?,?,?)
                on conflict (provider,provider_app_id,provider_subject) do nothing
                """, appId, subject, candidateUid, now, now);
        return jdbc.queryForObject("""
                select firebase_uid from external_auth_identities
                where provider='ZALO' and provider_app_id=? and provider_subject=?
                for update
                """, String.class, appId, subject);
    }

    private boolean requireAccount(String uid, boolean required) {
        List<AccountState> matches = jdbc.query("""
                select u.status,u.system_role from users u
                join auth_identities a on a.user_id=u.id
                where a.provider='FIREBASE' and a.provider_subject=?
                for update of u
                """, (row, index) -> new AccountState(row.getString("status"), row.getString("system_role")), uid);
        if (matches.isEmpty()) {
            if (required) throw new BusinessException(ErrorCode.AUTH_PROFILE_NOT_FOUND);
            return false;
        }
        AccountState account = matches.getFirst();
        if (!"ACTIVE".equals(account.status())) throw new BusinessException(ErrorCode.ACCOUNT_DISABLED);
        if (!"OWNER".equals(account.role())) throw new BusinessException(ErrorCode.ZALO_ACCOUNT_NOT_ALLOWED);
        return true;
    }

    private <T> T committed(Supplier<T> action) {
        return transactions.execute(status -> action.get());
    }

    private static <T> Optional<T> first(List<T> rows) {
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.getFirst());
    }

    private static ZaloOAuthSession session(ResultSet row, int index) throws SQLException {
        return new ZaloOAuthSession(row.getObject("id", UUID.class), row.getString("state_hash"),
                row.getString("browser_binding_hash"), ZaloPurpose.valueOf(row.getString("purpose")),
                row.getString("client_origin"), row.getString("client_request_id"), row.getString("client_challenge"),
                row.getString("verifier_ciphertext"), ZaloStatus.valueOf(row.getString("status")),
                row.getString("provider_subject"), row.getString("display_name"), row.getString("proof_hash"),
                row.getObject("created_at", OffsetDateTime.class), row.getObject("expires_at", OffsetDateTime.class),
                row.getObject("proof_expires_at", OffsetDateTime.class), row.getObject("completed_at", OffsetDateTime.class),
                row.getString("provider_app_id"));
    }

    private record AccountState(String status, String role) { }
}
