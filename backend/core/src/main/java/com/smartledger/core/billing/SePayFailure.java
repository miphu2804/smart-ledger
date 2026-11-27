package com.smartledger.core.billing;

/** Restricted webhook failure; never embeds provider payload, headers or database diagnostics. */
final class SePayFailure extends RuntimeException {
    private final int status;
    SePayFailure(int status) { super("SePay request could not be accepted"); this.status = status; }
    int status() { return status; }
}
