package com.smartledger.core.zalo;

/** Only an opaque verifier-bound reference may cross the Android App Link. */
public record ZaloNativeCallbackResult(String returnUrl, String nativeClientId, String requestId,
        ZaloPurpose purpose, String handoffReference, String errorCode) {
    @Override
    public String toString() { return "ZaloNativeCallbackResult[redacted]"; }
}
