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
    AUTH_SESSION_CONFLICT(HttpStatus.CONFLICT, "auth_session_conflict", "This account is being set up by another request; open the session again."),
    ADMIN_ACCESS_REQUIRED(HttpStatus.FORBIDDEN, "admin_access_required", "Only an admin can perform this operation."),
    INVALID_ADMIN_QUERY(HttpStatus.BAD_REQUEST, "invalid_admin_query", "Use valid filters, positive IDs, page >= 0, size 1-100 and a date range of at most 366 days."),
    ADMIN_OWNER_NOT_FOUND(HttpStatus.NOT_FOUND, "owner_not_found", "This owner is unavailable."),
    ADMIN_AUDIT_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "admin_audit_unavailable", "Administrative access cannot be audited. Please retry later."),
    SHOP_NOT_FOUND(HttpStatus.NOT_FOUND, "shop_not_found", "This shop is unavailable."),
    SHOP_INACTIVE(HttpStatus.FORBIDDEN, "shop_inactive", "This shop is inactive."),
    INVALID_IDEMPOTENCY_KEY(HttpStatus.BAD_REQUEST, "invalid_idempotency_key", "Idempotency-Key must contain 1 to 255 characters."),
    IDEMPOTENCY_KEY_CONFLICT(HttpStatus.CONFLICT, "idempotency_key_conflict", "This Idempotency-Key belongs to a different request."),
    IDEMPOTENCY_KEY_EXPIRED(HttpStatus.CONFLICT, "idempotency_key_expired", "This Idempotency-Key has expired; review the result before submitting again."),
    INVALID_PRODUCT_ID(HttpStatus.BAD_REQUEST, "invalid_product_id", "Product ID must be a positive integer."),
    PRODUCT_NOT_FOUND(HttpStatus.NOT_FOUND, "product_not_found", "This product is unavailable."),
    PRODUCT_CATEGORY_INVALID(HttpStatus.BAD_REQUEST, "product_category_invalid", "Category must be active in this shop."),
    PRODUCT_BARCODE_CONFLICT(HttpStatus.CONFLICT, "product_barcode_conflict", "Barcode already belongs to a product in this shop."),
    PRODUCT_STOCK_REQUIRED(HttpStatus.BAD_REQUEST, "product_stock_required", "Tracked products require a stock quantity."),
    PRODUCT_STOCK_NOT_TRACKED(HttpStatus.BAD_REQUEST, "product_stock_not_tracked", "Untracked products must not have a stock quantity."),
    INVALID_CUSTOMER_ID(HttpStatus.BAD_REQUEST, "invalid_customer_id", "Customer ID must be a positive integer."),
    CUSTOMER_NOT_FOUND(HttpStatus.NOT_FOUND, "customer_not_found", "This customer is unavailable in the selected shop."),
    CUSTOMER_REQUIRED_FOR_DEBT(HttpStatus.BAD_REQUEST, "customer_required_for_debt", "A customer is required before confirming an unpaid sale."),
    INVALID_DEBT_ID(HttpStatus.BAD_REQUEST, "invalid_debt_id", "Debt ID must be a positive integer."),
    DEBT_NOT_FOUND(HttpStatus.NOT_FOUND, "debt_not_found", "This debt is unavailable in the selected shop."),
    DEBT_ALREADY_SETTLED(HttpStatus.CONFLICT, "debt_already_settled", "This debt has already been settled."),
    DEBT_PAYMENT_INVALID(HttpStatus.BAD_REQUEST, "debt_payment_invalid", "Repayment must be positive and cannot exceed the outstanding debt."),
    INVALID_EXPENSE_ID(HttpStatus.BAD_REQUEST, "invalid_expense_id", "Expense ID must be a positive integer."),
    EXPENSE_NOT_FOUND(HttpStatus.NOT_FOUND, "expense_not_found", "This expense is unavailable in the selected shop."),
    EXPENSE_UPDATE_REQUIRED(HttpStatus.BAD_REQUEST, "expense_update_required", "At least one expense field must be provided."),
    INVALID_REPORT_PERIOD(HttpStatus.BAD_REQUEST, "invalid_report_period", "Period must be today, yesterday, this_week, week, month, or year."),
    INVALID_CATEGORY_ID(HttpStatus.BAD_REQUEST, "invalid_category_id", "Category ID must be a positive integer."),
    CATEGORY_NOT_FOUND(HttpStatus.NOT_FOUND, "category_not_found", "This category is unavailable."),
    CATEGORY_HAS_PRODUCTS(HttpStatus.CONFLICT, "category_has_products", "Archive the active products in this category first."),
    INVALID_DRAFT_ID(HttpStatus.BAD_REQUEST, "invalid_draft_id", "Draft ID must be a positive integer."),
    DRAFT_NOT_FOUND(HttpStatus.NOT_FOUND, "draft_not_found", "This draft is unavailable."),
    DRAFT_NOT_EDITABLE(HttpStatus.CONFLICT, "draft_not_editable", "Only a current draft can be changed."),
    DRAFT_ITEM_INVALID(HttpStatus.BAD_REQUEST, "draft_item_invalid", "A draft item needs either an active product in this shop or a custom name and unit, not both."),
    DRAFT_ITEM_DUPLICATE(HttpStatus.BAD_REQUEST, "draft_item_duplicate", "A product may appear only once in a draft."),
    DRAFT_TOTAL_INVALID(HttpStatus.BAD_REQUEST, "draft_total_invalid", "Draft total or discount is invalid."),
    DRAFT_PAYMENT_INVALID(HttpStatus.BAD_REQUEST, "draft_payment_invalid", "Initial payment cannot exceed the draft total; provide a payment method only when the paid amount is greater than zero."),
    PRODUCT_STOCK_INSUFFICIENT(HttpStatus.CONFLICT, "product_stock_insufficient", "Tracked product stock is insufficient."),
    INVALID_SALE_ID(HttpStatus.BAD_REQUEST, "invalid_sale_id", "Sale ID must be a positive integer."),
    SALE_NOT_FOUND(HttpStatus.NOT_FOUND, "sale_not_found", "This sale is unavailable."),
    SALE_ALREADY_VOIDED(HttpStatus.CONFLICT, "sale_already_voided", "This sale has already been voided."),
    SALE_PAYMENT_MISMATCH(HttpStatus.CONFLICT, "sale_payment_mismatch", "Sale payments do not match the recorded paid amount."),
    SALE_REFUND_NOT_FOUND(HttpStatus.NOT_FOUND, "sale_refund_not_found", "No refund exists for this sale."),
    SALE_REFUND_METHOD_REQUIRED(HttpStatus.BAD_REQUEST, "sale_refund_method_required", "A refund method is required when the sale has received payment."),
    SALE_REFUND_METHOD_INVALID(HttpStatus.BAD_REQUEST, "sale_refund_method_invalid", "Do not provide a refund method for a sale with no payment."),
    SALE_RESTOCK_UNAVAILABLE(HttpStatus.CONFLICT, "sale_restock_unavailable", "Stock cannot be safely restored for this sale item; void without restocking and adjust inventory separately."),
    INVALID_PAYMENT_ID(HttpStatus.BAD_REQUEST, "invalid_payment_id", "Payment ID must be a positive integer."),
    PAYMENT_NOT_FOUND(HttpStatus.NOT_FOUND, "payment_not_found", "This payment is unavailable."),
    INVALID_AUDIT_QUERY(HttpStatus.BAD_REQUEST, "invalid_audit_query", "Use a nonnegative page, size 1-100, positive entity ID and an increasing time range."),
    CONVERSATION_NOT_FOUND(HttpStatus.NOT_FOUND, "conversation_not_found", "This conversation is unavailable."),
    AI_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "ai_unavailable", "The assistant is unavailable. Please try again.");

    private final HttpStatus httpStatus;
    private final String code;
    private final String message;
}
