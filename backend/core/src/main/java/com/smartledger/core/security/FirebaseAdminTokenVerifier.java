package com.smartledger.core.security;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class FirebaseAdminTokenVerifier implements FirebaseTokenVerifier {

    private final FirebaseAuth firebaseAuth;

    public FirebaseAdminTokenVerifier(FirebaseAuth firebaseAuth) {
        this.firebaseAuth = firebaseAuth;
    }

    @Override
    public VerifiedFirebaseToken verify(String idToken) {
        try {
            FirebaseToken token = firebaseAuth.verifyIdToken(idToken);
            return new VerifiedFirebaseToken(
                    token.getUid(),
                    token.getEmail(),
                    token.isEmailVerified(),
                    stringClaim(token.getClaims(), "phone_number"),
                    token.getName(),
                    token.getPicture());
        } catch (FirebaseAuthException | IllegalArgumentException exception) {
            throw new FirebaseTokenVerificationException("Firebase ID token verification failed", exception);
        }
    }

    private String stringClaim(Map<String, Object> claims, String claimName) {
        Object value = claims.get(claimName);
        return value instanceof String stringValue ? stringValue : null;
    }
}
