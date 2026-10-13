package com.smartledger.core.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** JDBC-managed reservations, also mapped for schema validation and local ddl-auto=update. */
@Entity
@Table(name = "media_upload_keys", uniqueConstraints = @UniqueConstraint(
        name = "uq_media_upload_scope_operation_key", columnNames = {"scope_key", "operation", "idempotency_key"}))
public class MediaUploadKey {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "scope_key", nullable = false, length = 100)
    private String scopeKey;
    @Column(name = "user_id", nullable = false)
    private Long userId;
    @Column(nullable = false, length = 100)
    private String operation;
    @Column(name = "idempotency_key", nullable = false, length = 255)
    private String idempotencyKey;
    @Column(name = "request_hash", nullable = false, length = 128)
    private String requestHash;
    @Column(name = "public_id", nullable = false, length = 500)
    private String publicId;
    @Column(name = "lease_token", nullable = false)
    private UUID leaseToken;
    @Column(name = "expires_at", nullable = false)
    private OffsetDateTime expiresAt;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "response_body", columnDefinition = "jsonb")
    private String responseBody;
}
