package com.smartledger.core.controller;

import com.smartledger.core.dto.request.SaleVoidRequest;
import com.smartledger.core.dto.response.SaleRefundResponse;
import com.smartledger.core.dto.response.SaleResponse;
import com.smartledger.core.dto.response.SaleVoidResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.SaleService;
import com.smartledger.core.service.SaleVoidService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/sales")
@Tag(name = "Sales")
@SecurityRequirement(name = "bearerAuth")
public class SaleController {
    private final SaleService service;
    private final SaleVoidService voidService;

    public SaleController(SaleService service, SaleVoidService voidService) {
        this.service = service;
        this.voidService = voidService;
    }

    @GetMapping
    @Operation(summary = "List confirmed sales in the selected shop")
    public List<SaleResponse> list(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId) {
        return service.list(token, shopId);
    }

    @GetMapping("/{saleId}")
    @Operation(summary = "Get a sale with historical item snapshots")
    public SaleResponse getById(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable String saleId) {
        return service.getById(token, shopId, saleId);
    }

    @PostMapping("/{saleId}/void")
    @Operation(summary = "Void a sale, cancel its remaining debt and record a full refund of received money")
    public ResponseEntity<SaleVoidResponse> voidSale(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @PathVariable String saleId, @Valid @RequestBody SaleVoidRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(voidService.voidSale(token, shopId, saleId, idempotencyKey, request));
    }

    @GetMapping("/{saleId}/refund")
    @Operation(summary = "Get the full refund recorded for a voided sale")
    public SaleRefundResponse getRefund(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable String saleId) {
        return voidService.getRefund(token, shopId, saleId);
    }
}
