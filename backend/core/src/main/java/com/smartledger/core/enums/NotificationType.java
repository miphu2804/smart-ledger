package com.smartledger.core.enums;

/** Only implemented notification types; push and AI reminders are not implied. */
public enum NotificationType {
    LOW_STOCK, OUT_OF_STOCK, SALE_VOIDED, SHOP_INACTIVATED, SHOP_REACTIVATED;

    public boolean isStockAlert() { return this == LOW_STOCK || this == OUT_OF_STOCK; }
}
