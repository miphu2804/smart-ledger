package com.smartledger.core.service;

import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.enums.SystemRole;
import java.util.LinkedHashMap;
import java.util.Map;

public interface AuditLogService {
    void record(Long shopId, Long actorId, SystemRole actorRole, AuditAction action,
            Long entityId, String reason, String idempotencyKey, Map<String, Object> metadata);

    default void recordOwner(Shop shop, AuditAction action, Long entityId, String reason,
            String key, Map<String, Object> metadata) {
        record(shop.getId(), shop.getOwnerId(), SystemRole.OWNER, action, entityId, reason, key, metadata);
    }

    /** Nullable numeric snapshots are valid JSON; Map.of cannot represent those values. */
    static Map<String, Object> metadata(Object... entries) {
        if (entries.length % 2 != 0) { throw new IllegalArgumentException("Metadata requires key/value pairs"); }
        var map = new LinkedHashMap<String, Object>();
        for (int i = 0; i < entries.length; i += 2) { map.put((String) entries[i], entries[i + 1]); }
        return map;
    }
}
