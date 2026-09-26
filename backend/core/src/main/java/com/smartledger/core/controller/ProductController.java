package com.smartledger.core.controller;

import com.smartledger.core.dto.request.ProductWriteRequest;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ProductService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
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
@RequestMapping("/api/v1/products")
@Tag(name = "Products")
@SecurityRequirement(name = "bearerAuth")
public class ProductController {

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @PostMapping
    @Operation(summary = "Create a product in the selected shop")
    @ApiResponse(responseCode = "201", description = "Product created",
            content = @Content(schema = @Schema(implementation = ProductResponse.class)))
    public ResponseEntity<ProductResponse> create(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @RequestHeader("X-Shop-Id") String shopId,
            @Valid @RequestBody ProductWriteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(productService.create(firebaseToken, shopId, request));
    }

    @GetMapping
    @Operation(summary = "List active products in the selected shop")
    @ApiResponse(responseCode = "200", description = "Active products")
    public List<ProductResponse> list(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @RequestHeader("X-Shop-Id") String shopId) {
        return productService.list(firebaseToken, shopId);
    }

    @GetMapping("/{productId}")
    @Operation(summary = "Get an active product in the selected shop")
    @ApiResponse(responseCode = "200", description = "Product",
            content = @Content(schema = @Schema(implementation = ProductResponse.class)))
    public ProductResponse getById(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @RequestHeader("X-Shop-Id") String shopId,
            @Parameter(description = "Product ID", example = "1") @PathVariable String productId) {
        return productService.getById(firebaseToken, shopId, productId);
    }

    @PutMapping("/{productId}")
    @Operation(summary = "Replace an active product in the selected shop")
    @ApiResponse(responseCode = "200", description = "Product updated",
            content = @Content(schema = @Schema(implementation = ProductResponse.class)))
    public ProductResponse replace(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @RequestHeader("X-Shop-Id") String shopId,
            @Parameter(description = "Product ID", example = "1") @PathVariable String productId,
            @Valid @RequestBody ProductWriteRequest request) {
        return productService.replace(firebaseToken, shopId, productId, request);
    }

    @DeleteMapping("/{productId}")
    @Operation(summary = "Archive a product in the selected shop")
    @ApiResponse(responseCode = "204", description = "Product archived")
    public ResponseEntity<Void> archive(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @RequestHeader("X-Shop-Id") String shopId,
            @Parameter(description = "Product ID", example = "1") @PathVariable String productId) {
        productService.archive(firebaseToken, shopId, productId);
        return ResponseEntity.noContent().build();
    }
}
