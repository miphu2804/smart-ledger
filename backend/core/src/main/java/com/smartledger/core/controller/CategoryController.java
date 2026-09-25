package com.smartledger.core.controller;

import com.smartledger.core.dto.request.CategoryWriteRequest;
import com.smartledger.core.dto.response.CategoryResponse;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.CategoryService;
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
@RequestMapping("/api/v1/categories")
@Tag(name = "Categories")
@SecurityRequirement(name = "bearerAuth")
public class CategoryController {
    private final CategoryService categoryService;

    public CategoryController(CategoryService categoryService) {
        this.categoryService = categoryService;
    }

    @PostMapping
    @Operation(summary = "Create a category in the selected shop")
    @ApiResponse(responseCode = "201", description = "Category created",
            content = @Content(schema = @Schema(implementation = CategoryResponse.class)))
    public ResponseEntity<CategoryResponse> create(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @RequestHeader("X-Shop-Id") String shopId,
            @Valid @RequestBody CategoryWriteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(categoryService.create(firebaseToken, shopId, request));
    }

    @GetMapping
    @Operation(summary = "List active categories in the selected shop")
    @ApiResponse(responseCode = "200", description = "Active categories")
    public List<CategoryResponse> list(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @RequestHeader("X-Shop-Id") String shopId) {
        return categoryService.list(firebaseToken, shopId);
    }

    @GetMapping("/{categoryId}")
    @Operation(summary = "Get an active category in the selected shop")
    @ApiResponse(responseCode = "200", description = "Category",
            content = @Content(schema = @Schema(implementation = CategoryResponse.class)))
    public CategoryResponse getById(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @RequestHeader("X-Shop-Id") String shopId,
            @Parameter(description = "Category ID", example = "1") @PathVariable String categoryId) {
        return categoryService.getById(firebaseToken, shopId, categoryId);
    }

    @PutMapping("/{categoryId}")
    @Operation(summary = "Replace an active category in the selected shop")
    @ApiResponse(responseCode = "200", description = "Category updated",
            content = @Content(schema = @Schema(implementation = CategoryResponse.class)))
    public CategoryResponse replace(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @RequestHeader("X-Shop-Id") String shopId,
            @Parameter(description = "Category ID", example = "1") @PathVariable String categoryId,
            @Valid @RequestBody CategoryWriteRequest request) {
        return categoryService.replace(firebaseToken, shopId, categoryId, request);
    }

    @DeleteMapping("/{categoryId}")
    @Operation(summary = "Archive an empty category in the selected shop")
    @ApiResponse(responseCode = "204", description = "Category archived")
    public ResponseEntity<Void> archive(
            @AuthenticationPrincipal VerifiedFirebaseToken firebaseToken,
            @RequestHeader("X-Shop-Id") String shopId,
            @Parameter(description = "Category ID", example = "1") @PathVariable String categoryId) {
        categoryService.archive(firebaseToken, shopId, categoryId);
        return ResponseEntity.noContent().build();
    }
}
