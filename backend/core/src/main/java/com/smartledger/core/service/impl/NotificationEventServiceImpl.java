package com.smartledger.core.service.impl;

import com.smartledger.core.entity.NotificationEvent;
import com.smartledger.core.entity.NotificationRecipient;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Sale;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.NotificationType;
import com.smartledger.core.enums.ShopStatus;
import com.smartledger.core.repository.NotificationEventRepository;
import com.smartledger.core.repository.NotificationRecipientRepository;
import com.smartledger.core.service.NotificationEventService;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(propagation = Propagation.MANDATORY)
public class NotificationEventServiceImpl implements NotificationEventService {
    private static final List<NotificationType> STOCK_TYPES =
            List.of(NotificationType.LOW_STOCK, NotificationType.OUT_OF_STOCK);
    private final NotificationEventRepository events;
    private final NotificationRecipientRepository recipients;

    public NotificationEventServiceImpl(NotificationEventRepository events, NotificationRecipientRepository recipients) {
        this.events = events;
        this.recipients = recipients;
    }

    @Override
    public void reconcileStock(Shop shop, Product product) {
        reconcileStock(shop, List.of(product));
    }

    @Override
    public void reconcileStock(Shop shop, Collection<Product> products) {
        if (products.isEmpty()) return;
        // Process each locked product once, retaining the caller's stable order.
        Map<Long, Product> uniqueProducts = new LinkedHashMap<>();
        products.forEach(product -> uniqueProducts.putIfAbsent(product.getId(), product));
        Map<Long, List<NotificationEvent>> openByProduct = events
                .findAllByShopIdAndEntityTypeAndEntityIdInAndTypeInAndResolvedAtIsNull(
                        shop.getId(), "PRODUCT", List.copyOf(uniqueProducts.keySet()), STOCK_TYPES)
                .stream().collect(Collectors.groupingBy(NotificationEvent::getEntityId));
        uniqueProducts.values().forEach(product ->
                reconcileStock(shop, product, openByProduct.getOrDefault(product.getId(), List.of())));
    }

    private void reconcileStock(Shop shop, Product product, List<NotificationEvent> open) {
        NotificationType desired = stockType(product);
        if (open.size() == 1 && open.getFirst().getType() == desired) return;
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        open.forEach(event -> event.resolve(now));
        // Release the partial-unique-index slot before opening a different alert.
        if (!open.isEmpty()) events.flush();
        if (desired == null) return;
        long previous = events.findFirstByShopIdAndEntityTypeAndEntityIdOrderByIdDesc(
                shop.getId(), "PRODUCT", product.getId()).map(NotificationEvent::getId).orElse(0L);
        String key = "stock:" + product.getId() + ":" + desired + ":" + previous;
        boolean out = desired == NotificationType.OUT_OF_STOCK;
        append(shop, desired, out ? "Sản phẩm đã hết hàng" : "Sản phẩm sắp hết hàng",
                product.getName() + (out ? " đã hết hàng." : " chỉ còn "
                        + product.getStockQuantity().stripTrailingZeros().toPlainString() + " " + product.getUnit() + "."),
                "PRODUCT", product.getId(), key, Map.of("stockQuantity", product.getStockQuantity()));
    }

    private NotificationType stockType(Product product) {
        if (!product.isTracked() || product.getStatus() != CatalogStatus.ACTIVE || product.getStockQuantity() == null) return null;
        if (product.getStockQuantity().signum() == 0) return NotificationType.OUT_OF_STOCK;
        BigDecimal threshold = product.getLowStockThreshold();
        return threshold != null && product.getStockQuantity().compareTo(threshold) <= 0
                ? NotificationType.LOW_STOCK : null;
    }

    @Override
    public void saleVoided(Shop shop, Sale sale) {
        append(shop, NotificationType.SALE_VOIDED, "Đơn hàng đã hủy", "Đơn #" + sale.getId() + " đã được hủy.",
                "SALE", sale.getId(), "sale-voided:" + sale.getId(), Map.of());
    }

    @Override
    public void shopStatusChanged(Shop shop, ShopStatus before) {
        if (before == shop.getStatus()) return;
        long previous = events.findFirstByShopIdAndEntityTypeAndEntityIdOrderByIdDesc(
                shop.getId(), "SHOP", shop.getId()).map(NotificationEvent::getId).orElse(0L);
        boolean inactive = shop.getStatus() == ShopStatus.INACTIVE;
        append(shop, inactive ? NotificationType.SHOP_INACTIVATED : NotificationType.SHOP_REACTIVATED,
                inactive ? "Tiệm đã bị tạm ngưng" : "Tiệm đã được kích hoạt lại",
                inactive ? "Tiệm đang tạm ngưng. Mở hồ sơ tiệm để xem lý do và liên hệ hỗ trợ."
                        : "Tiệm đã được kích hoạt lại. Bạn có thể tiếp tục vận hành.",
                "SHOP", shop.getId(), "shop-status:" + shop.getStatus() + ":" + previous, Map.of());
    }

    private void append(Shop shop, NotificationType type, String title, String body, String entityType,
            Long entityId, String key, Map<String, Object> data) {
        if (events.existsByShopIdAndDedupKey(shop.getId(), key)) return;
        NotificationEvent event = events.saveAndFlush(NotificationEvent.create(shop.getId(), type, title, body,
                entityType, entityId, key, data));
        recipients.save(NotificationRecipient.forOwner(event, shop.getOwnerId()));
    }
}
