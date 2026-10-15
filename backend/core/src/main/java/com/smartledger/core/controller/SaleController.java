package com.smartledger.core.controller;

import com.smartledger.core.dto.request.OwnerListQuery.Sales;
import com.smartledger.core.dto.request.OwnerListQuery.SalesSummary;
import com.smartledger.core.dto.request.SaleVoidRequest;
import com.smartledger.core.dto.response.PageResponse;
import com.smartledger.core.dto.response.SaleRefundResponse;
import com.smartledger.core.dto.response.SaleResponse;
import com.smartledger.core.dto.response.SaleSummaryResponse;
import com.smartledger.core.dto.response.SaleVoidResponse;
import com.smartledger.core.enums.SaleStatus;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.SaleService;
import com.smartledger.core.service.SaleVoidService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import com.smartledger.core.exception.ApiErrorResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
import org.springframework.format.annotation.DateTimeFormat;
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
    @Operation(summary = "List sales in the selected shop, including voided history",
            description = "DB pagination: page starts at 0; size 1-100 (default 20); offset <= 2147483647. "
                    + "Returns items/page/size/totalElements/totalPages, not an array. "
                    + "Ordered by soldAt/id DESC. from/to require ISO-8601 timestamps with an offset; "
                    + "soldAt >= from and soldAt < to. Either bound may be omitted; from must precede to. "
                    + "q searches customer/item snapshots without Vietnamese accents, or an exact sale ID.")
    public PageResponse<SaleResponse> list(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) SaleStatus saleStatus,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to) {
        return service.list(token, shopId, new Sales(page, size, q, saleStatus, from, to));
    }

    @GetMapping("/summary")
    @Operation(summary = "Summarize all sales matching the list filters, without pagination",
            description = "Uses the same q/saleStatus predicates as GET /sales. from/to require an ISO-8601 "
                    + "timestamp with an offset: soldAt >= from, soldAt < to. Either bound may be omitted; "
                    + "no bounds means all history. Filters are applied before COUNT/SUM, not to a page. "
                    + "Values use current CONFIRMED/VOIDED status; not cash collected or report netRevenueVnd "
                    + "(which adjusts by voidedAt). Counts include VOIDED, but confirmedSalesVnd does not. "
                    + "Separate list and summary HTTP requests do not share a snapshot.")
    @ApiResponse(responseCode = "200", description = "Filtered order counts and sale-value totals",
            content = @Content(schema = @Schema(implementation = SaleSummaryResponse.class)))
    @ApiResponse(responseCode = "400", description = "invalid_sale_query or validation_failed",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    @ApiResponse(responseCode = "401", description = "unauthorized",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    @ApiResponse(responseCode = "403", description = "shop_access_denied, account_disabled or shop_inactive",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    @ApiResponse(responseCode = "404", description = "auth_profile_not_found or shop_not_found",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    @ApiResponse(responseCode = "409", description = "sale_summary_overflow: narrow the filters",
            content = @Content(schema = @Schema(implementation = ApiErrorResponse.class)))
    public SaleSummaryResponse summary(@AuthenticationPrincipal VerifiedFirebaseToken token,
            @RequestHeader("X-Shop-Id") String shopId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) SaleStatus saleStatus,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) OffsetDateTime to) {
        return service.summary(token, shopId, new SalesSummary(q, saleStatus, from, to));
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
