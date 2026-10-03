package com.smartledger.core.controller;

import com.smartledger.core.dto.request.ExpensePatchRequest;
import com.smartledger.core.dto.request.ExpenseWriteRequest;
import com.smartledger.core.dto.response.ExpenseResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ExpenseService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/expenses")
@Tag(name = "Expenses")
@SecurityRequirement(name = "bearerAuth")
public class ExpenseController {
    private final ExpenseService service;

    public ExpenseController(ExpenseService service) {
        this.service = service;
    }

    @PostMapping
    @Operation(summary = "Record a manual expense for the selected shop")
    public ResponseEntity<ExpenseResponse> create(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody ExpenseWriteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(token, shopId, idempotencyKey, request));
    }

    @GetMapping
    @Operation(summary = "List active expenses, optionally filtered by period")
    public List<ExpenseResponse> list(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @RequestParam(required = false) String period) {
        return service.list(token, shopId, period);
    }

    @GetMapping("/{expenseId}")
    @Operation(summary = "Get an active expense by ID")
    public ExpenseResponse getById(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable String expenseId) {
        return service.getById(token, shopId, expenseId);
    }

    @PatchMapping("/{expenseId}")
    @Operation(summary = "Partially update an active expense")
    public ExpenseResponse patch(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable String expenseId,
            @Valid @RequestBody ExpensePatchRequest request) {
        return service.patch(token, shopId, expenseId, request);
    }

    @DeleteMapping("/{expenseId}")
    @Operation(summary = "Archive an expense without deleting its history")
    public ResponseEntity<Void> archive(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable String expenseId) {
        service.archive(token, shopId, expenseId);
        return ResponseEntity.noContent().build();
    }
}
