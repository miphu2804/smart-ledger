package com.smartledger.core.security;

/**
 * The server-verified Firebase identity made available to the authentication layer.
 *
 * <p>These values are claims from a verified Firebase ID token. They are not yet
 * SmartLedger user data: the database will map {@code uid} to an internal user
 * through {@code auth_identities}.</p>
 */
public record VerifiedFirebaseToken(
        String uid,
        String email,
        boolean emailVerified,
        String phoneNumber,
        String displayName,
        String avatarUrl) {
}
