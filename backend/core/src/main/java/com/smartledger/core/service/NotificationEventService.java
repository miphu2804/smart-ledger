package com.smartledger.core.service;

import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ShopStatus;
import java.util.Collection;

/** Called inside the business transaction, with the source Product/Sale/Shop already locked. */
public interface NotificationEventService {
    /** Delegates a single Product to the same stock-alert lifecycle used by batch reconciliation. */
    void reconcileStock(Shop shop, Product product);

    /**
     * Reconciles persisted Products belonging to the shop inside the caller's business transaction.
     * The caller holds their row locks; this method does not acquire them. Empty groups do no work,
     * and duplicate IDs are processed once in encounter order. Nonempty groups read open alerts once;
     * new alert cycles still need per-product history/dedup queries and event/recipient writes.
     * Failures propagate so notification changes roll back with the business operation.
     */
    void reconcileStock(Shop shop, Collection<Product> products);
    void saleVoided(Shop shop, Sale sale);
    void shopStatusChanged(Shop shop, ShopStatus before);
}
