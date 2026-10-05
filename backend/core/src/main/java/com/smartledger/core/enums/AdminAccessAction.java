package com.smartledger.core.enums;

/** API filters mapped to the shared audit_logs action whitelist, never financial events. */
public enum AdminAccessAction {
    OVERVIEW_VIEWED("SYSTEM"), OWNERS_SEARCHED("OWNER_LIST"), OWNER_VIEWED("OWNER"),
    SHOPS_SEARCHED("SHOP_LIST"), SHOP_VIEWED("SHOP"), SHOP_STATUS_HISTORY_VIEWED("SHOP"),
    ACCESS_LOGS_VIEWED("ADMIN_ACCESS_LOG_LIST"), SHOP_STATUS_UPDATED("SHOP");

    private final String targetType;
    AdminAccessAction(String targetType) { this.targetType = targetType; }
    public String targetType() { return targetType; }
    public boolean requiresTarget() { return this == OWNER_VIEWED || requiresShop(); }
    public boolean requiresShop() { return this == SHOP_VIEWED || this == SHOP_STATUS_HISTORY_VIEWED || this == SHOP_STATUS_UPDATED; }
    public java.util.List<AuditAction> auditActions() {
        return this == SHOP_STATUS_UPDATED
                ? java.util.List.of(AuditAction.SHOP_INACTIVATED, AuditAction.SHOP_REACTIVATED)
                : java.util.List.of(AuditAction.valueOf("ADMIN_" + name()));
    }
    public static AdminAccessAction fromAuditAction(AuditAction action) {
        if (action == AuditAction.SHOP_INACTIVATED || action == AuditAction.SHOP_REACTIVATED) { return SHOP_STATUS_UPDATED; }
        if (!action.isAdminRead()) { throw new IllegalArgumentException("Not an administrative action"); }
        return valueOf(action.name().substring("ADMIN_".length()));
    }
}
