package com.smartledger.core.controller;

import com.smartledger.core.dto.request.OwnerListQuery.ProductSort;
import com.smartledger.core.dto.request.OwnerListQuery.Products;
import com.smartledger.core.dto.request.OwnerListQuery.StockStatus;
import com.smartledger.core.dto.request.ProductPatchRequest;
import com.smartledger.core.dto.request.ProductStockInRequest;
import com.smartledger.core.dto.request.ProductWriteRequest;
import com.smartledger.core.dto.response.PageResponse;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.MediaService;
import com.smartledger.core.service.ProductService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/products")
@Tag(name = "Products")
@SecurityRequirement(name = "bearerAuth")
public class ProductController {

    private final ProductService productService;
    private final MediaService mediaService;

    public ProductController(ProductService productService, MediaService mediaService) {
        this.productService = productService;
        this.mediaService = mediaService;
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
    @Operation(summary = "List active products in the selected shop",
            description = "DB pagination: page starts at 0; size 1-100 (default 20); offset <= 2147483647. "
                    + "Returns items/page/size/totalElements/totalPages, not an array. "
                    + "q searches name/barcode literally, case/accent insensitive. Default sort ID_ASC; "
                    + "NAME_ASC, PRICE_ASC, STOCK_DESC include an ID tie-break. LOW excludes zero stock; "
                    + "OUT means tracked zero stock; NEEDS_RESTOCK is their union, using each product's threshold.")
    @ApiResponse(responseCode = "200", description = "Active products")
    public PageResponse<ProductResponse> list(@AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @RequestHeader("X-Shop-Id") String shopId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) StockStatus stockStatus,
            @RequestParam(required = false) ProductSort sort) {
        return productService.list(firebaseToken, shopId, new Products(page, size, q, categoryId, stockStatus, sort));
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

    @PatchMapping("/{productId}")
    @Operation(summary = "Partially update an active product in the selected shop",
            description = "stockQuantity is not accepted (400). Enabling tracking starts at zero; use stock-in to add stock.")
    @ApiResponse(responseCode = "200", description = "Product updated",
            content = @Content(schema = @Schema(implementation = ProductResponse.class)))
    public ProductResponse patch(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @RequestHeader("X-Shop-Id") String shopId,
            @Parameter(description = "Product ID", example = "1") @PathVariable String productId,
            @Valid @RequestBody ProductPatchRequest request) {
        return productService.patch(firebaseToken, shopId, productId, request);
    }

    @PostMapping(path = "/{productId}/image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload the primary image for an active product")
    @ApiResponse(responseCode = "200", description = "Image uploaded or idempotent response replayed",
            content = @Content(schema = @Schema(implementation = ProductResponse.class)))
    public ProductResponse uploadImage(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @RequestHeader("X-Shop-Id") String shopId,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @PathVariable String productId,
            @RequestPart("image") MultipartFile image) {
        return mediaService.uploadProductImage(firebaseToken, shopId, productId, idempotencyKey, image);
    }

    @DeleteMapping("/{productId}/image")
    @Operation(summary = "Remove the product image; deletion of the provider asset is retried asynchronously")
    @ApiResponse(responseCode = "204", description = "Image removed or already absent")
    public ResponseEntity<Void> deleteImage(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @RequestHeader("X-Shop-Id") String shopId,
            @PathVariable String productId) {
        mediaService.deleteProductImage(firebaseToken, shopId, productId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{productId}/stock-in")
    @Operation(summary = "Add stock to an active tracked product",
            description = "Positive quantity, up to 12 integer and 3 fractional digits. Retry with the same key and normalized payload replays the original response without adding stock again.")
    @ApiResponse(responseCode = "200", description = "Stock added or original result replayed",
            content = @Content(schema = @Schema(implementation = ProductResponse.class)))
    public ProductResponse stockIn(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @RequestHeader("X-Shop-Id") String shopId,
            @PathVariable String productId,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody ProductStockInRequest request) {
        return productService.stockIn(firebaseToken, shopId, productId, idempotencyKey, request);
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
