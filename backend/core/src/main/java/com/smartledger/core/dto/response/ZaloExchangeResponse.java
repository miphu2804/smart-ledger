package com.smartledger.core.dto.response;

import io.swagger.v3.oas.annotations.media.Schema;

/** Exchange this credential using Firebase SDK; it is not an API Bearer token. */
public record ZaloExchangeResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 1,
                description = "Sensitive credential for Firebase signInWithCustomToken, not a Core ID token")
        String firebaseCustomToken,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED, minLength = 1, maxLength = 255,
                description = "Verified name hint for first-session onboarding; does not rename an existing account")
        String displayName) {
    @Override
    public String toString() { return "ZaloExchangeResponse[redacted]"; }
}
