package com.smartledger.core.billing;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.security.VerifiedFirebaseToken;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.parameters.RequestBody;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Firebase-authenticated OWNER billing APIs, independent of shop context. */
@RestController
@RequestMapping("/api/v1/billing")
@Tag(name = "Billing")
@SecurityRequirement(name = "bearerAuth")
public class BillingController {
    private final BillingService service;
    public BillingController(BillingService service) { this.service = service; }

    @GetMapping("/plans")
    @Operation(summary = "Read the server-owned plan catalog; no shop required")
    public ResponseEntity<List<BillingPlanResponse>> plans(@AuthenticationPrincipal VerifiedFirebaseToken token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.plans(token));
    }

    @PostMapping("/payment-requests")
    @Operation(summary = "Create an idempotent payment request with a 30-minute deadline",
            description = "Only planCode and planVersion are accepted; no client amount, owner or bank configuration.",
            requestBody = @RequestBody(required = true, content = @Content(mediaType = "application/json",
                    schema = @Schema(type = "object", example = "{\"planCode\":\"FULL_MONTHLY\",\"planVersion\":1}"))),
            responses = @ApiResponse(responseCode = "201", description = "Created or original creation replay"))
    public ResponseEntity<BillingPaymentResponse> create(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("Idempotency-Key") String key, HttpServletRequest request) throws IOException {
        if (!jsonContent(request)) throw new BusinessException(ErrorCode.INVALID_BILLING_REQUEST);
        byte[] body = request.getInputStream().readNBytes(4097);
        if (body.length > 4096) throw new BusinessException(ErrorCode.INVALID_BILLING_REQUEST);
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(service.create(token, key, body));
    }

    @GetMapping("/payment-requests/{id}")
    @Operation(summary = "Read current payment/fulfillment state, restricted to its OWNER")
    public ResponseEntity<BillingPaymentResponse> get(@AuthenticationPrincipal VerifiedFirebaseToken token, @PathVariable long id) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.get(token, id));
    }

    static boolean jsonContent(HttpServletRequest request) {
        String type = request.getContentType();
        return type != null && type.split(";", 2)[0].strip().equalsIgnoreCase("application/json");
    }
}
