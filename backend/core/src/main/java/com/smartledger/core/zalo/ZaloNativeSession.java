package com.smartledger.core.zalo;

import java.time.OffsetDateTime;
import java.util.UUID;

/** V18 Android columns are JDBC-only; no Hibernate schema generation or startup query. */
public record ZaloNativeSession(UUID id, String stateHash, String browserBindingHash, ZaloPurpose purpose,
        String requestId, String clientChallenge, String verifierCiphertext, ZaloStatus status,
        String providerSubject, String displayName, OffsetDateTime createdAt, OffsetDateTime expiresAt,
        String providerAppId, String nativeClientId, String returnTargetId) {
    @Override
    public String toString() { return "ZaloNativeSession[redacted]"; }
}
