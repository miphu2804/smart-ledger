package com.smartledger.core.repository;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class MediaUploadKeyRepository {
    private final JdbcTemplate jdbc;

    public MediaUploadKeyRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public boolean reserve(String scope, Long userId, String operation, String key, String hash,
            String publicId, UUID token, OffsetDateTime expiresAt) {
        return jdbc.update("""
                INSERT INTO media_upload_keys(scope_key,user_id,operation,idempotency_key,request_hash,
                    public_id,lease_token,expires_at) VALUES (?,?,?,?,?,?,?,?)
                ON CONFLICT(scope_key,operation,idempotency_key) DO NOTHING
                """, scope, userId, operation, key, hash, publicId, token, expiresAt) == 1;
    }

    public Optional<StoredResult> findOptional(String scope, String operation, String key) {
        return jdbc.query("""
                SELECT user_id,request_hash,response_body,expires_at,lease_token
                FROM media_upload_keys WHERE scope_key=? AND operation=? AND idempotency_key=?
                """, (rs, row) -> new StoredResult(rs.getLong("user_id"), rs.getString("request_hash"),
                rs.getString("response_body"), rs.getTimestamp("expires_at").toInstant().atOffset(ZoneOffset.UTC),
                rs.getObject("lease_token", UUID.class)), scope, operation, key).stream().findFirst();
    }

    public boolean reclaim(String scope, String operation, String key, UUID oldToken, UUID newToken,
            OffsetDateTime expiresAt) {
        return jdbc.update("""
                UPDATE media_upload_keys SET lease_token=?,expires_at=?
                WHERE scope_key=? AND operation=? AND idempotency_key=? AND lease_token=?
                    AND response_body IS NULL AND expires_at <= CURRENT_TIMESTAMP
                """, newToken, expiresAt, scope, operation, key, oldToken) == 1;
    }

    public void lockPending(String scope, String operation, String key, UUID token) {
        boolean valid = !jdbc.queryForList("""
                SELECT id FROM media_upload_keys WHERE scope_key=? AND operation=? AND idempotency_key=?
                    AND lease_token=? AND response_body IS NULL AND expires_at > CURRENT_TIMESTAMP FOR UPDATE
                """, scope, operation, key, token).isEmpty();
        if (!valid) throw new com.smartledger.core.exception.BusinessException(
                com.smartledger.core.enums.ErrorCode.MEDIA_UPLOAD_IN_PROGRESS);
    }

    public void completePending(String scope, String operation, String key, UUID token, String json,
            OffsetDateTime expiresAt) {
        int count = jdbc.update("""
                UPDATE media_upload_keys SET response_body=CAST(? AS jsonb),expires_at=?
                WHERE scope_key=? AND operation=? AND idempotency_key=? AND lease_token=? AND response_body IS NULL
                """, json, expiresAt, scope, operation, key, token);
        if (count != 1) throw new IllegalStateException("Media reservation is no longer owned by this request");
    }

    public void releasePending(String scope, String operation, String key, UUID token) {
        jdbc.update("""
                DELETE FROM media_upload_keys WHERE scope_key=? AND operation=? AND idempotency_key=?
                    AND lease_token=? AND response_body IS NULL
                """, scope, operation, key, token);
    }

    public record StoredResult(Long userId, String requestHash, String responseBody,
            OffsetDateTime expiresAt, UUID leaseToken) { }
}
