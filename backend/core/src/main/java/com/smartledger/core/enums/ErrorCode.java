package com.smartledger.core.enums;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum ErrorCode {
    ACCOUNT_DISABLED(HttpStatus.FORBIDDEN, "account_disabled", "This account is disabled."),
    AUTH_PROFILE_NOT_FOUND(HttpStatus.NOT_FOUND, "auth_profile_not_found", "No local SmartLedger profile exists yet."),
    DISPLAY_NAME_REQUIRED(HttpStatus.BAD_REQUEST, "validation_failed", "Display name is required for a new account."),
    INVALID_SHOP_ID(HttpStatus.BAD_REQUEST, "invalid_shop_id", "Shop ID must be a positive integer."),
    SHOP_UPDATE_REQUIRED(HttpStatus.BAD_REQUEST, "shop_update_required", "At least one shop field must be provided."),
    SHOP_ARCHIVE_OPERATION_REQUIRED(HttpStatus.BAD_REQUEST, "shop_archive_operation_required", "Use the delete operation to archive a shop."),
    SHOP_INACTIVE_REASON_REQUIRED(HttpStatus.BAD_REQUEST, "shop_inactive_reason_required", "An inactive reason is required."),
    SHOP_STATUS_CHANGE_INVALID(HttpStatus.BAD_REQUEST, "shop_status_change_invalid", "Only ACTIVE or INACTIVE is allowed for this operation."),
    SHOP_ACCESS_DENIED(HttpStatus.FORBIDDEN, "shop_access_denied", "You cannot access this shop."),
    ADMIN_ACCESS_REQUIRED(HttpStatus.FORBIDDEN, "admin_access_required", "Only an admin can perform this operation."),
    SHOP_NOT_FOUND(HttpStatus.NOT_FOUND, "shop_not_found", "This shop is unavailable."),
    SHOP_INACTIVE(HttpStatus.FORBIDDEN, "shop_inactive", "This shop is inactive."),
    INVALID_PRODUCT_ID(HttpStatus.BAD_REQUEST, "invalid_product_id", "Product ID must be a positive integer."),
    PRODUCT_NOT_FOUND(HttpStatus.NOT_FOUND, "product_not_found", "This product is unavailable."),
    PRODUCT_CATEGORY_INVALID(HttpStatus.BAD_REQUEST, "product_category_invalid", "Category must be active in this shop."),
    PRODUCT_BARCODE_CONFLICT(HttpStatus.CONFLICT, "product_barcode_conflict", "Barcode already belongs to a product in this shop."),
    PRODUCT_STOCK_REQUIRED(HttpStatus.BAD_REQUEST, "product_stock_required", "Tracked products require a stock quantity."),
    PRODUCT_STOCK_NOT_TRACKED(HttpStatus.BAD_REQUEST, "product_stock_not_tracked", "Untracked products must not have a stock quantity."),
    INVALID_CATEGORY_ID(HttpStatus.BAD_REQUEST, "invalid_category_id", "Category ID must be a positive integer."),
    CATEGORY_NOT_FOUND(HttpStatus.NOT_FOUND, "category_not_found", "This category is unavailable."),
    CATEGORY_HAS_PRODUCTS(HttpStatus.CONFLICT, "category_has_products", "Archive the active products in this category first."),
    INVALID_DRAFT_ID(HttpStatus.BAD_REQUEST, "invalid_draft_id", "Draft ID must be a positive integer."),
    DRAFT_NOT_FOUND(HttpStatus.NOT_FOUND, "draft_not_found", "This draft is unavailable."),
    DRAFT_NOT_EDITABLE(HttpStatus.CONFLICT, "draft_not_editable", "Only a current draft can be changed."),
    DRAFT_ITEM_INVALID(HttpStatus.BAD_REQUEST, "draft_item_invalid", "Every draft item must reference an active product in this shop."),
    DRAFT_ITEM_DUPLICATE(HttpStatus.BAD_REQUEST, "draft_item_duplicate", "A product may appear only once in a draft."),
    DRAFT_TOTAL_INVALID(HttpStatus.BAD_REQUEST, "draft_total_invalid", "Draft total or discount is invalid."),
    DRAFT_PAYMENT_INVALID(HttpStatus.BAD_REQUEST, "draft_payment_invalid", "Initial payment cannot exceed the draft total."),
    FULL_PAYMENT_REQUIRED(HttpStatus.BAD_REQUEST, "full_payment_required", "Only fully paid sales are supported in this phase."),
    PRODUCT_STOCK_INSUFFICIENT(HttpStatus.CONFLICT, "product_stock_insufficient", "Tracked product stock is insufficient."),
    INVALID_SALE_ID(HttpStatus.BAD_REQUEST, "invalid_sale_id", "Sale ID must be a positive integer."),
    SALE_NOT_FOUND(HttpStatus.NOT_FOUND, "sale_not_found", "This sale is unavailable."),
    INVALID_PAYMENT_ID(HttpStatus.BAD_REQUEST, "invalid_payment_id", "Payment ID must be a positive integer."),
    PAYMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "payment_not_found", "This payment is unavailable.");

    private final HttpStatus httpStatus;
    private final String code;
    private final String message;
}
