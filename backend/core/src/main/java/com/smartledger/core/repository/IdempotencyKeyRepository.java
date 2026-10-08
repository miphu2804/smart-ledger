package com.smartledger.core.repository;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class IdempotencyKeyRepository {
    private final JdbcTemplate jdbcTemplate;

    public IdempotencyKeyRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public boolean reserve(Long shopId, Long userId, String operation, String key, String requestHash,
            OffsetDateTime expiresAt) {
        return jdbcTemplate.update("""
                INSERT INTO api_idempotency_keys
                    (shop_id, user_id, operation, idempotency_key, request_hash, expires_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (shop_id, operation, idempotency_key) DO NOTHING
                """, shopId, userId, operation, key, requestHash, expiresAt) == 1;
    }

    public StoredResult find(Long shopId, String operation, String key) {
        return jdbcTemplate.queryForObject("""
                SELECT user_id, request_hash, response_body, expires_at
                FROM api_idempotency_keys
                WHERE shop_id = ? AND operation = ? AND idempotency_key = ?
                """, (result, row) -> new StoredResult(
                result.getLong("user_id"),
                result.getString("request_hash"),
                result.getString("response_body"),
                result.getTimestamp("expires_at").toInstant().atOffset(ZoneOffset.UTC)),
                shopId, operation, key);
    }

    public void complete(Long shopId, String operation, String key, String resourceType,
            Long resourceId, int responseStatus, String responseBody) {
        int updated = jdbcTemplate.update("""
                UPDATE api_idempotency_keys
                SET resource_type = ?, resource_id = ?, response_status = ?,
                    response_body = CAST(? AS jsonb)
                WHERE shop_id = ? AND operation = ? AND idempotency_key = ?
                """, resourceType, resourceId, responseStatus, responseBody, shopId, operation, key);
        if (updated != 1) {
            throw new IllegalStateException("Idempotency result could not be saved");
        }
    }

    public record StoredResult(Long userId, String requestHash, String responseBody,
            OffsetDateTime expiresAt) {
    }
}
