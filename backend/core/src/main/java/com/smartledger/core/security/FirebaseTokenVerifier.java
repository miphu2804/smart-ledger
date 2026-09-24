package com.smartledger.core.security;

public interface FirebaseTokenVerifier {

    VerifiedFirebaseToken verify(String idToken);
}
