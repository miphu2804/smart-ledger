package com.smartledger.core.security;

public class FirebaseTokenVerificationException extends RuntimeException {

    public FirebaseTokenVerificationException(String message, Throwable cause) {
        super(message, cause);
    }
}
