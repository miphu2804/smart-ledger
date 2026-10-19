package com.smartledger.core.zalo;

/** Minimal verified provider result; access tokens and provider photos are deliberately excluded. */
public record ZaloProfile(String subject, String displayName) {
}
