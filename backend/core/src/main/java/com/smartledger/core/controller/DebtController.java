package com.smartledger.core.controller;

import com.smartledger.core.dto.request.DebtRepaymentRequest;
import com.smartledger.core.dto.request.OwnerListQuery.Debts;
import com.smartledger.core.dto.response.DebtRepaymentResponse;
import com.smartledger.core.dto.response.DebtResponse;
import com.smartledger.core.dto.response.PageResponse;
import com.smartledger.core.enums.DebtStatus;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.DebtService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/debts")
@Tag(name = "Debts")
@SecurityRequirement(name = "bearerAuth")
public class DebtController {
    private final DebtService service;

    public DebtController(DebtService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(summary = "List debts in the selected shop",
            description = "DB pagination: page starts at 0; size 1-100 (default 20); offset <= 2147483647. "
                    + "Returns items/page/size/totalElements/totalPages, not an array. "
                    + "Ordered by ID DESC. status/customerId apply before paging/counting; scope follows the sale's shop.")
    public PageResponse<DebtResponse> list(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) DebtStatus status,
            @RequestParam(required = false) Long customerId) {
        return service.list(token, shopId, new Debts(page, size, status, customerId));
    }

    @GetMapping("/{debtId}")
    @Operation(summary = "Get a debt by ID")
    public DebtResponse getById(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable String debtId) {
        return service.getById(token, shopId, debtId);
    }

    @PostMapping("/{debtId}/payments")
    @Operation(summary = "Record an append-only debt repayment and update the outstanding balance")
    public ResponseEntity<DebtRepaymentResponse> repay(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId,
            @RequestHeader("Idempotency-Key") String idempotencyKey, @PathVariable String debtId,
            @Valid @RequestBody DebtRepaymentRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.repay(token, shopId, debtId, idempotencyKey, request));
    }
}
