package com.smartledger.core.controller;

import com.smartledger.core.dto.request.SaleDraftWriteRequest;
import com.smartledger.core.dto.response.SaleDraftResponse;
import com.smartledger.core.dto.response.SaleResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.SaleDraftService;
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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/sale-drafts")
@Tag(name = "Sale Drafts")
@SecurityRequirement(name = "bearerAuth")
public class SaleDraftController {
    private final SaleDraftService service;

    public SaleDraftController(SaleDraftService service) {
        this.service = service;
    }

    @PostMapping
    @Operation(summary = "Create a manual sale draft without changing stock or revenue")
    public ResponseEntity<SaleDraftResponse> create(
            @AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId,
            @Valid @RequestBody SaleDraftWriteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(token, shopId, request));
    }

    @GetMapping
    @Operation(summary = "List sale drafts in the selected shop")
    public List<SaleDraftResponse> list(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId) {
        return service.list(token, shopId);
    }

    @GetMapping("/{draftId}")
    @Operation(summary = "Get a sale draft by ID")
    public SaleDraftResponse getById(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable String draftId) {
        return service.getById(token, shopId, draftId);
    }

    @PutMapping("/{draftId}")
    @Operation(summary = "Replace a pending sale draft and its items")
    public SaleDraftResponse replace(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable String draftId,
            @Valid @RequestBody SaleDraftWriteRequest request) {
        return service.replace(token, shopId, draftId, request);
    }

    @DeleteMapping("/{draftId}")
    @Operation(summary = "Cancel a pending sale draft without deleting its history")
    public ResponseEntity<Void> cancel(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable String draftId) {
        service.cancel(token, shopId, draftId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{draftId}/confirm")
    @Operation(summary = "Confirm a fully paid draft and record the sale, payment and stock change")
    public ResponseEntity<SaleResponse> confirm(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable String draftId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.confirm(token, shopId, draftId));
    }
}
