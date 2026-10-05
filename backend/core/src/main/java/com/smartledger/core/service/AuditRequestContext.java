package com.smartledger.core.service;

import java.util.UUID;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/** Server-owned correlation shared by business and administrative audit, never a client header. */
public final class AuditRequestContext {
    private static final String REQUEST_ID = AuditRequestContext.class.getName() + ".requestId";
    private AuditRequestContext() { }

    public static String requestId() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes) {
            var request = attributes.getRequest();
            if (request.getAttribute(REQUEST_ID) instanceof String id) { return id; }
            String id = UUID.randomUUID().toString();
            request.setAttribute(REQUEST_ID, id);
            return id;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            if (TransactionSynchronizationManager.getResource(REQUEST_ID) instanceof String id) { return id; }
            String id = UUID.randomUUID().toString();
            TransactionSynchronizationManager.bindResource(REQUEST_ID, id);
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    TransactionSynchronizationManager.unbindResourceIfPossible(REQUEST_ID);
                }
            });
            return id;
        }
        return UUID.randomUUID().toString();
    }
}
