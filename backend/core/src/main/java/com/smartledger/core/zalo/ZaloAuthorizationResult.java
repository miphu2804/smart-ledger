package com.smartledger.core.zalo;

/** Transport-only secrets, never written to a log or returned as a JSON response. */
public record ZaloAuthorizationResult(String authorizationUrl, String cookieName, String cookieValue, int maxAge) {
    @Override
    public String toString() { return "ZaloAuthorizationResult[redacted]"; }
}
