package com.smartledger.core.service;

import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.ShopStatus;

/** Called inside the business transaction, with the source Product/Sale/Shop already locked. */
public interface NotificationEventService {
    void reconcileStock(Shop shop, Product product);
    void saleVoided(Shop shop, Sale sale);
    void shopStatusChanged(Shop shop, ShopStatus before);
}
