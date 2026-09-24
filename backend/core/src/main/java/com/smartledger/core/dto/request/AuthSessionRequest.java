package com.smartledger.core.dto.request;

import jakarta.validation.constraints.Size;

/**
 * {@code displayName} is required only for the first sign-in of a Firebase UID.
 */
public record AuthSessionRequest(
        @Size(max = 150, message = "must not exceed 150 characters")
        String displayName) {
}
