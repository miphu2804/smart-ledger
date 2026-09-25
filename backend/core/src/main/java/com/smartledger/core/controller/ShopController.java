package com.smartledger.core.controller;

import com.smartledger.core.dto.request.ArchiveShopRequest;
import com.smartledger.core.dto.request.ShopCreateRequest;
import com.smartledger.core.dto.request.ShopStatusUpdateRequest;
import com.smartledger.core.dto.request.ShopUpdateRequest;
import com.smartledger.core.dto.response.ShopResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ShopService;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/shops")
@Tag(name = "Shops")
@SecurityRequirement(name = "bearerAuth")
public class ShopController {

    private final ShopService shopService;

    public ShopController(ShopService shopService) {
        this.shopService = shopService;
    }

    @PostMapping
    @Operation(summary = "Create a shop for the current OWNER")
    @ApiResponse(
            responseCode = "201",
            description = "Shop created",
            content = @Content(schema = @Schema(implementation = ShopResponse.class)))
    public ResponseEntity<ShopResponse> create(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @Valid @RequestBody ShopCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(shopService.create(firebaseToken, request));
    }

    @GetMapping("/{shopId}")
    @Operation(summary = "Get a shop by its ID")
    @ApiResponse(
            responseCode = "200",
            description = "Current shop",
            content = @Content(schema = @Schema(implementation = ShopResponse.class)))
    public ShopResponse getById(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @Parameter(description = "Shop ID", required = true, example = "1")
            @PathVariable String shopId) {
        return shopService.getById(firebaseToken, shopId);
    }

    @PatchMapping("/{shopId}")
    @Operation(summary = "Update a shop by its ID")
    @ApiResponse(
            responseCode = "200",
            description = "Shop updated",
            content = @Content(schema = @Schema(implementation = ShopResponse.class)))
    public ShopResponse updateById(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @Parameter(description = "Shop ID", required = true, example = "1")
            @PathVariable String shopId,
            @Valid @RequestBody ShopUpdateRequest request) {
        return shopService.updateById(firebaseToken, shopId, request);
    }

    @PatchMapping("/{shopId}/status")
    @Operation(summary = "Change a shop status (currently ADMIN only)")
    @ApiResponse(
            responseCode = "200",
            description = "Shop status updated",
            content = @Content(schema = @Schema(implementation = ShopResponse.class)))
    public ShopResponse updateStatus(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @Parameter(description = "Shop ID", required = true, example = "1")
            @PathVariable String shopId,
            @Valid @RequestBody ShopStatusUpdateRequest request) {
        return shopService.updateStatus(firebaseToken, shopId, request);
    }

    @DeleteMapping("/{shopId}")
    @Operation(summary = "Archive a shop")
    @ApiResponse(responseCode = "204", description = "Shop archived")
    public ResponseEntity<Void> archiveById(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @Parameter(description = "Shop ID", required = true, example = "1")
            @PathVariable String shopId,
            @Valid @RequestBody ArchiveShopRequest request) {
        shopService.archiveById(firebaseToken, shopId, request);
        return ResponseEntity.noContent().build();
    }
}
