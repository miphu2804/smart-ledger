package com.smartledger.core.exception;

public class DisplayNameRequiredException extends RuntimeException {

    public DisplayNameRequiredException() {
        super("displayName is required when creating a SmartLedger account.");
    }
}
