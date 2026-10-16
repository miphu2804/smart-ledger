package com.smartledger.core.zalo;

/** Proof is delivered only to the exact, previously allowlisted client origin. */
public record ZaloCallbackResult(String clientOrigin, String requestId, ZaloPurpose purpose,
        String proof, String errorCode, String cookieName) {
    @Override
    public String toString() { return "ZaloCallbackResult[redacted]"; }
}
