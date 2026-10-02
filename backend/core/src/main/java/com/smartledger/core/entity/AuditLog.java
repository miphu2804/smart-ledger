package com.smartledger.core.entity;

import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.enums.PaymentMethod;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.enums.SystemRole;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Success-only, append-only evidence; business tables remain the source of truth. */
@Entity
@Table(name = "audit_logs", indexes = {
        @Index(name = "idx_audit_logs_shop_time", columnList = "shop_id,created_at,id"),
        @Index(name = "idx_audit_logs_entity", columnList = "entity_type,entity_id"),
        @Index(name = "idx_audit_logs_actor", columnList = "actor_user_id")})
@Immutable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AuditLog {
    private static final Set<String> PAYMENT_METHODS = enumNames(PaymentMethod.values());
    private static final Set<String> SHOP_STATUSES = enumNames(ShopStatus.values());
    private static final Set<String> BOOLEAN_KEYS = Set.of("restockItems", "tracked", "beforeTracked", "afterTracked");
    private static final Set<String> FIELD_NAMES = Set.of("name", "industry", "phone", "address", "categoryId",
            "barcode", "imageUrl", "unit", "sellingPriceVnd", "costPriceVnd", "tracked", "stockQuantity",
            "category", "description", "amountVnd", "paymentMethod", "expenseAt");

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "actor_user_id", nullable = false, updatable = false)
    private Long actorUserId;
    @Enumerated(EnumType.STRING) @Column(name = "actor_role", nullable = false, length = 20, updatable = false)
    private SystemRole actorRole;
    @Column(name = "shop_id", nullable = false, updatable = false)
    private Long shopId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 100, updatable = false)
    private AuditAction action;
    @Column(name = "entity_type", nullable = false, length = 100, updatable = false)
    private String entityType;
    @Column(name = "entity_id", nullable = false, updatable = false)
    private Long entityId;
    @Column(nullable = false, length = 20, updatable = false)
    private String outcome;
    @Column(length = 500, updatable = false)
    private String reason;
    @Column(name = "request_id", nullable = false, length = 36, updatable = false)
    private String requestId;
    @Column(name = "idempotency_key", length = 255, updatable = false)
    private String idempotencyKey;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb", nullable = false, updatable = false)
    private Map<String, Object> metadata;
    // Keep the original ERD columns nullable; never capture full request/entity snapshots or IP headers.
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "old_data", columnDefinition = "jsonb", updatable = false)
    private Map<String, Object> oldData;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "new_data", columnDefinition = "jsonb", updatable = false)
    private Map<String, Object> newData;
    @Column(name = "ip_address", length = 64, updatable = false)
    private String ipAddress;
    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    public static AuditLog success(Long shopId, Long actorId, SystemRole actorRole, AuditAction action,
            Long entityId, String reason, String requestId, String key, Map<String, Object> metadata) {
        if (shopId == null || shopId <= 0 || actorId == null || actorId <= 0 || entityId == null || entityId <= 0
                || actorRole == null || action == null || requestId == null
                || !requestId.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}")) {
            throw new IllegalArgumentException("Audit requires trusted actor, shop, target and server request ID");
        }
        if ((reason != null && reason.length() > 500) || (key != null && key.length() > 255)) {
            throw new IllegalArgumentException("Audit context exceeds its limit");
        }
        var event = new AuditLog();
        event.shopId = shopId;
        event.actorUserId = actorId;
        event.actorRole = actorRole;
        event.action = action;
        event.entityType = action.entityType();
        event.entityId = entityId;
        event.outcome = "SUCCESS";
        event.reason = normalize(reason);
        event.requestId = requestId;
        event.idempotencyKey = normalize(key);
        event.metadata = safeMetadata(action, metadata);
        event.createdAt = OffsetDateTime.now(ZoneOffset.UTC);
        return event;
    }

    private static Map<String, Object> safeMetadata(AuditAction action, Map<String, Object> supplied) {
        var safe = new LinkedHashMap<String, Object>();
        if (supplied == null) { return Map.of(); }
        supplied.forEach((key, value) -> {
            if (!action.metadataKeys().contains(key)) {
                throw new IllegalArgumentException("Unknown audit metadata key");
            }
            Object normalized = value instanceof Enum<?> enumeration ? enumeration.name() : value;
            boolean valid;
            if (key.equals("changedFields")) {
                valid = normalized instanceof List<?> fields && fields.size() <= FIELD_NAMES.size()
                        && fields.stream().allMatch(field -> field instanceof String && FIELD_NAMES.contains(field));
                if (valid) { normalized = List.copyOf((List<?>) normalized); }
            } else if (BOOLEAN_KEYS.contains(key)) {
                valid = normalized instanceof Boolean;
            } else if (key.equals("paymentMethod")) {
                valid = normalized == null || PAYMENT_METHODS.contains(normalized);
            } else if (key.equals("source")) {
                valid = normalized != null && Set.of("CATALOG_EDIT", "SALE_CONFIRM").contains(normalized);
            } else if (key.equals("beforeStatus") || key.equals("afterStatus")) {
                valid = normalized != null && SHOP_STATUSES.contains(normalized);
            } else {
                // JSONB may hydrate decimal numbers as Double rather than BigDecimal.
                valid = normalized == null || normalized instanceof Long || normalized instanceof Integer
                        || normalized instanceof BigDecimal
                        || normalized instanceof Double number && Double.isFinite(number);
            }
            if (!valid) { throw new IllegalArgumentException("Unsafe audit metadata value"); }
            safe.put(key, normalized);
        });
        return Collections.unmodifiableMap(safe);
    }

    private static String normalize(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static Set<String> enumNames(Enum<?>[] values) {
        return Arrays.stream(values).map(Enum::name).collect(Collectors.toUnmodifiableSet());
    }

    /** Validated once on write; stored rows are append-only and must stay readable as recorded. */
    public Map<String, Object> getMetadata() {
        return metadata == null ? Map.of() : Collections.unmodifiableMap(metadata);
    }
}
