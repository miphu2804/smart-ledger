package com.smartledger.core.billing;

import com.smartledger.core.security.VerifiedFirebaseToken;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Shopless Firebase routes; ownership is resolved from the verified token, never a client ID. */
@RestController
@Tag(name = "Billing")
public class SubscriptionController {
    private final SubscriptionService service;
    public SubscriptionController(SubscriptionService service) { this.service = service; }

    @GetMapping("/api/v1/billing/subscription")
    @Operation(summary = "Read effective OWNER subscription and manual-renewal term")
    public ResponseEntity<SubscriptionResponse> subscription(@AuthenticationPrincipal VerifiedFirebaseToken token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.subscription(token));
    }

    @GetMapping("/api/v1/agent/quota")
    @Operation(summary = "Read OWNER quota policy/counters and the configured chat admission gate")
    public ResponseEntity<QuotaResponse> quota(@AuthenticationPrincipal VerifiedFirebaseToken token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.quota(token));
    }
}
