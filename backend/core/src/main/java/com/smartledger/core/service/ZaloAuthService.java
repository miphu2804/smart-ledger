package com.smartledger.core.service;

import com.smartledger.core.dto.request.ZaloProofRequest;
import com.smartledger.core.dto.response.ZaloExchangeResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.zalo.ZaloAuthorizationResult;
import com.smartledger.core.zalo.ZaloCallbackResult;
import com.smartledger.core.zalo.ZaloPurpose;

public interface ZaloAuthService {
    ZaloAuthorizationResult authorize(ZaloPurpose purpose, String origin, String requestId, String clientChallenge);
    ZaloCallbackResult callback(String state, String code, String error, String codeChallenge, String browserBinding);
    ZaloExchangeResponse exchange(ZaloProofRequest request, String origin);
    void link(ZaloProofRequest request, String origin, VerifiedFirebaseToken principal, String rawIdToken);
    void cleanupExpiredSessions();
}
