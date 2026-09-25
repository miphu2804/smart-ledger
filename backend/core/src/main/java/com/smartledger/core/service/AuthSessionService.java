package com.smartledger.core.service;

import com.smartledger.core.dto.response.AuthSessionResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;

public interface AuthSessionService {

    AuthSessionResponse openSession(VerifiedFirebaseToken firebaseToken, String requestedDisplayName);

    AuthSessionResponse getCurrentSession(VerifiedFirebaseToken firebaseToken);
}
