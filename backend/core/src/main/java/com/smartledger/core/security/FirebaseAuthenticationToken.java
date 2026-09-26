package com.smartledger.core.security;

import java.util.List;
import org.springframework.security.authentication.AbstractAuthenticationToken;

public class FirebaseAuthenticationToken extends AbstractAuthenticationToken {

    private final VerifiedFirebaseToken principal;

    public FirebaseAuthenticationToken(VerifiedFirebaseToken principal) {
        super(List.of());
        this.principal = principal;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return "";
    }

    @Override
    public VerifiedFirebaseToken getPrincipal() {
        return principal;
    }
}
