package com.smartledger.core.zalo;

import java.time.OffsetDateTime;
import java.util.UUID;

/** JDBC-only OAuth state: deliberately not a JPA entity until a schema migration is approved. */
public record ZaloOAuthSession(
        UUID id,
        String stateHash,
        String browserBindingHash,
        ZaloPurpose purpose,
        String clientOrigin,
        String clientRequestId,
        String clientChallenge,
        String verifierCiphertext,
        ZaloStatus status,
        String providerSubject,
        String displayName,
        String proofHash,
        OffsetDateTime createdAt,
        OffsetDateTime expiresAt,
        OffsetDateTime proofExpiresAt,
        OffsetDateTime completedAt,
        String providerAppId) {

    @Override
    public String toString() {
        return "ZaloOAuthSession[id=" + id + ", status=" + status + "]";
    }
}
