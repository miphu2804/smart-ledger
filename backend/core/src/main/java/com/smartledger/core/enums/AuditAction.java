package com.smartledger.core.enums;

import java.util.Set;

/** Internal, typed events. Metadata keys are deliberately narrower than API DTOs. */
public enum AuditAction {
    SALE_CONFIRMED("SALE", "draftId", "totalVnd", "paidVnd", "outstandingVnd", "itemCount"),
    SALE_VOIDED("SALE", "receivedVnd", "refundedVnd", "cancelledDebtVnd", "restockItems", "restoredItemCount"),
    SALE_REFUND_RECORDED("SALE_REFUND", "saleId", "amountVnd", "paymentMethod"),
    DEBT_REPAYMENT_RECORDED("DEBT", "saleId", "paymentId", "amountVnd", "beforeBalanceVnd", "afterBalanceVnd"),
    DEBT_VOIDED("DEBT", "saleId", "cancelledDebtVnd"),
    STOCK_ADJUSTED("PRODUCT", "saleId", "source", "quantity", "beforeStock", "afterStock", "beforeTracked", "afterTracked"),
    STOCK_RESTORED_ON_VOID("PRODUCT", "saleId", "quantity", "beforeStock", "afterStock"),
    EXPENSE_CREATED("EXPENSE", "amountVnd", "paymentMethod"),
    EXPENSE_UPDATED("EXPENSE", "beforeAmountVnd", "afterAmountVnd", "changedFields"),
    EXPENSE_ARCHIVED("EXPENSE", "amountVnd"),
    PRODUCT_CREATED("PRODUCT", "sellingPriceVnd", "costPriceVnd", "tracked", "stockQuantity"),
    PRODUCT_UPDATED("PRODUCT", "beforeSellingPriceVnd", "afterSellingPriceVnd", "changedFields"),
    PRODUCT_ARCHIVED("PRODUCT"),
    CATEGORY_CREATED("CATEGORY"),
    CATEGORY_UPDATED("CATEGORY", "changedFields"),
    CATEGORY_ARCHIVED("CATEGORY"),
    SHOP_CREATED("SHOP"),
    SHOP_UPDATED("SHOP", "changedFields"),
    SHOP_ARCHIVED("SHOP", "beforeStatus", "afterStatus"),
    SHOP_INACTIVATED("SHOP", "beforeStatus", "afterStatus"),
    SHOP_REACTIVATED("SHOP", "beforeStatus", "afterStatus"),
    USER_AVATAR_UPDATED("USER", "changedFields"),
    ADMIN_OVERVIEW_VIEWED("SYSTEM", "queryPresent", "resultCount"),
    ADMIN_OWNERS_SEARCHED("OWNER_LIST", "queryPresent", "resultCount"),
    ADMIN_OWNER_VIEWED("OWNER", "queryPresent", "resultCount"),
    ADMIN_SHOPS_SEARCHED("SHOP_LIST", "queryPresent", "resultCount"),
    ADMIN_SHOP_VIEWED("SHOP", "queryPresent", "resultCount"),
    ADMIN_SHOP_STATUS_HISTORY_VIEWED("SHOP", "queryPresent", "resultCount"),
    ADMIN_ACCESS_LOGS_VIEWED("ADMIN_ACCESS_LOG_LIST", "queryPresent", "resultCount");

    private final String entityType;
    private final Set<String> metadataKeys;

    AuditAction(String entityType, String... keys) {
        this.entityType = entityType;
        this.metadataKeys = Set.of(keys);
    }

    public String entityType() { return entityType; }
    public Set<String> metadataKeys() { return metadataKeys; }
    public boolean isAdminRead() { return name().startsWith("ADMIN_"); }
    public boolean isUserProfileAction() { return this == USER_AVATAR_UPDATED; }
}
