package com.smartledger.core.controller;

import com.smartledger.core.dto.response.PaymentResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.PaymentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/sales/{saleId}/payments")
@Tag(name = "Payments")
@SecurityRequirement(name = "bearerAuth")
public class PaymentController {
    private final PaymentService service;

    public PaymentController(PaymentService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(summary = "List append-only payments recorded for a sale")
    public List<PaymentResponse> list(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable String saleId) {
        return service.listForSale(token, shopId, saleId);
    }

    @GetMapping("/{paymentId}")
    @Operation(summary = "Get a recorded payment by ID")
    public PaymentResponse getById(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable String saleId,
            @PathVariable String paymentId) {
        return service.getById(token, shopId, saleId, paymentId);
    }
}
