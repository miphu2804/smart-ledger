package com.smartledger.core.billing;

import jakarta.servlet.http.HttpServletRequest;

/** One shared predicate for the Firebase filter exception and Spring Security's public matcher. */
public final class SePayWebhookRoute {
    private SePayWebhookRoute() {}
    public static boolean matches(HttpServletRequest request) {
        if (request.getRequestURI() == null) return false;
        String context = request.getContextPath() == null ? "" : request.getContextPath();
        String path = request.getRequestURI().substring(context.length());
        return "POST".equals(request.getMethod()) && path.matches("/api/v1/webhooks/sepay/[A-Za-z0-9_-]{1,64}");
    }
}
