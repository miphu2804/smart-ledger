package com.smartledger.core.controller;

import com.smartledger.core.dto.request.CustomerWriteRequest;
import com.smartledger.core.dto.request.OwnerListQuery.Customers;
import com.smartledger.core.dto.response.CustomerResponse;
import com.smartledger.core.dto.response.PageResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.CustomerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/customers")
@Tag(name = "Customers")
@SecurityRequirement(name = "bearerAuth")
public class CustomerController {
    private final CustomerService service;

    public CustomerController(CustomerService service) {
        this.service = service;
    }

    @PostMapping
    @Operation(summary = "Create a customer in the selected shop")
    public ResponseEntity<CustomerResponse> create(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @Valid @RequestBody CustomerWriteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(token, shopId, request));
    }

    @GetMapping
    @Operation(summary = "List active customers in the selected shop",
            description = "DB pagination: page starts at 0; size 1-100 (default 20); offset <= 2147483647. "
                    + "Returns items/page/size/totalElements/totalPages, not an array. "
                    + "Ordered by ID ASC. q searches name/normalized phone literally, case/accent insensitive.")
    public PageResponse<CustomerResponse> list(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String q) {
        return service.list(token, shopId, new Customers(page, size, q));
    }

    @GetMapping("/{customerId}")
    @Operation(summary = "Get an active customer by ID")
    public CustomerResponse getById(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable String customerId) {
        return service.getById(token, shopId, customerId);
    }

    @PutMapping("/{customerId}")
    @Operation(summary = "Replace a customer's name and phone")
    public CustomerResponse replace(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable String customerId,
            @Valid @RequestBody CustomerWriteRequest request) {
        return service.replace(token, shopId, customerId, request);
    }

    @DeleteMapping("/{customerId}")
    @Operation(summary = "Archive a customer without deleting sales or debts")
    public ResponseEntity<Void> archive(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId, @PathVariable String customerId) {
        service.archive(token, shopId, customerId);
        return ResponseEntity.noContent().build();
    }
}
