package com.smartledger.core.exception;

public class AuthProfileNotFoundException extends RuntimeException {

    public AuthProfileNotFoundException() {
        super("No SmartLedger profile exists for this Firebase account.");
    }
}
