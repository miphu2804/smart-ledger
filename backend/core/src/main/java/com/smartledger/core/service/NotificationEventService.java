package com.smartledger.core.service;

import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ShopStatus;
import java.util.Collection;

/** Called inside the business transaction, with the source Product/Sale/Shop already locked. */
public interface NotificationEventService {
    void reconcileStock(Shop shop, Product product);
    /** Reads open alerts once; new alert cycles retain per-product history and dedup queries. */
    void reconcileStock(Shop shop, Collection<Product> products);
    void saleVoided(Shop shop, Sale sale);
    void shopStatusChanged(Shop shop, ShopStatus before);
}
