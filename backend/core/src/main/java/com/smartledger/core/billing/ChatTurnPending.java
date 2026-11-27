package com.smartledger.core.billing;

import java.util.UUID;

/** An existing logical turn is executing/reconciling; retry the same semantic input and key. */
public final class ChatTurnPending extends RuntimeException {
    private final UUID turnId;
    public ChatTurnPending(UUID turnId) { super("AI turn pending"); this.turnId = turnId; }
    public UUID turnId() { return turnId; }
    public record Response(UUID turnId, String status) {}
}
