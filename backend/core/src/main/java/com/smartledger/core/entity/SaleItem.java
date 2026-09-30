package com.smartledger.core.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "sale_items")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SaleItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "sale_id", nullable = false)
    private Long saleId;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "product_name_snapshot", nullable = false, length = 255)
    private String productNameSnapshot;

    @Column(name = "unit_snapshot", nullable = false, length = 50)
    private String unitSnapshot;

    @Column(nullable = false, precision = 15, scale = 3)
    private BigDecimal quantity;

    @Column(name = "unit_price_vnd", nullable = false)
    private Long unitPriceVnd;

    @Column(name = "line_total_vnd", nullable = false)
    private Long lineTotalVnd;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public static SaleItem fromDraftItem(Long saleId, SaleDraftItem draftItem) {
        SaleItem item = new SaleItem();
        item.saleId = saleId;
        item.productId = draftItem.getProductId();
        item.productNameSnapshot = draftItem.getProductNameSnapshot();
        item.unitSnapshot = draftItem.getUnitSnapshot();
        item.quantity = draftItem.getQuantity();
        item.unitPriceVnd = draftItem.getUnitPriceVnd();
        item.lineTotalVnd = draftItem.getLineTotalVnd();
        return item;
    }

    @PrePersist
    void onCreate() {
        createdAt = OffsetDateTime.now(ZoneOffset.UTC);
    }
}
