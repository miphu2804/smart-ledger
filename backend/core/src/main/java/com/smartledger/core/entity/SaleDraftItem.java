package com.smartledger.core.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "sale_draft_items")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SaleDraftItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "draft_id", nullable = false)
    private Long draftId;

    @Column(name = "product_id")
    private Long productId;

    @Column(name = "raw_product_name", length = 255)
    private String rawProductName;

    @Column(name = "product_name_snapshot", length = 255)
    private String productNameSnapshot;

    @Column(name = "unit_snapshot", length = 50)
    private String unitSnapshot;

    @Column(nullable = false, precision = 15, scale = 3)
    private BigDecimal quantity;

    @Column(name = "unit_price_vnd", nullable = false)
    private Long unitPriceVnd;

    @Column(name = "line_total_vnd", nullable = false)
    private Long lineTotalVnd;

    @Column(name = "needs_review", nullable = false)
    private boolean needsReview;

    @Column(name = "confidence_score", precision = 5, scale = 4)
    private BigDecimal confidenceScore;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public static SaleDraftItem create(Long draftId, Product product, BigDecimal quantity,
            long unitPriceVnd, long lineTotalVnd) {
        SaleDraftItem item = new SaleDraftItem();
        item.draftId = draftId;
        item.productId = product.getId();
        item.productNameSnapshot = product.getName();
        item.unitSnapshot = product.getUnit();
        item.quantity = quantity;
        item.unitPriceVnd = unitPriceVnd;
        item.lineTotalVnd = lineTotalVnd;
        item.needsReview = false;
        return item;
    }

    @PrePersist
    void onCreate() {
        OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }
}
