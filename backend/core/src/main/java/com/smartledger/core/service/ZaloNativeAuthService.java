package com.smartledger.core.service;

import com.smartledger.core.dto.request.ZaloNativeHandoffRequest;
import com.smartledger.core.dto.response.ZaloExchangeResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.zalo.ZaloAuthorizationResult;
import com.smartledger.core.zalo.ZaloNativeCallbackResult;
import com.smartledger.core.zalo.ZaloPurpose;

public interface ZaloNativeAuthService {
    boolean isNativeCallback(String state);
    ZaloAuthorizationResult authorize(String nativeClientId, ZaloPurpose purpose, String requestId, String challenge);
    ZaloNativeCallbackResult callback(String state, String code, String error, String codeChallenge, String binding);
    ZaloExchangeResponse exchange(ZaloNativeHandoffRequest request);
    void link(ZaloNativeHandoffRequest request, VerifiedFirebaseToken principal, String rawIdToken);
}
