package com.smartledger.core.entity;

import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "products")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Product {
    private static final BigDecimal MAX_STOCK = new BigDecimal("999999999999.999");

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "shop_id", nullable = false)
    private Long shopId;

    @Column(name = "category_id")
    private Long categoryId;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(length = 100)
    private String barcode;

    @Column(name = "image_url", length = 1000)
    private String imageUrl;

    @Column(name = "image_public_id", length = 500)
    private String imagePublicId;

    @Column(nullable = false, length = 50)
    private String unit;

    @Column(name = "selling_price_vnd", nullable = false)
    private Long sellingPriceVnd;

    @Column(name = "cost_price_vnd")
    private Long costPriceVnd;

    @Column(nullable = false)
    private boolean tracked;

    @Column(name = "stock_quantity", precision = 15, scale = 3)
    private BigDecimal stockQuantity;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CatalogStatus status;

    @Column(name = "archived_at")
    private OffsetDateTime archivedAt;

    @Column(name = "archived_by_user_id")
    private Long archivedByUserId;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    public static Product create(Long shopId) {
        Product product = new Product();
        product.shopId = shopId;
        product.status = CatalogStatus.ACTIVE;
        return product;
    }

    public void replace(
            Long categoryId,
            String name,
            String barcode,
            String imageUrl,
            String unit,
            Long sellingPriceVnd,
            Long costPriceVnd,
            boolean tracked,
            BigDecimal stockQuantity) {
        this.categoryId = categoryId;
        this.name = name;
        this.barcode = barcode;
        if (!Objects.equals(this.imageUrl, imageUrl)) {
            imagePublicId = null;
        }
        this.imageUrl = imageUrl;
        this.unit = unit;
        this.sellingPriceVnd = sellingPriceVnd;
        this.costPriceVnd = costPriceVnd;
        this.tracked = tracked;
        this.stockQuantity = stockQuantity;
    }

    public void replaceCloudinaryImage(String imageUrl, String imagePublicId) {
        this.imageUrl = imageUrl;
        this.imagePublicId = imagePublicId;
    }

    public void clearImage() {
        imageUrl = null;
        imagePublicId = null;
    }

    public void archive(Long userId) {
        status = CatalogStatus.ARCHIVED;
        archivedAt = OffsetDateTime.now(ZoneOffset.UTC);
        archivedByUserId = userId;
    }

    public void deductStock(BigDecimal quantity) {
        if (quantity == null || quantity.signum() <= 0) {
            throw new IllegalArgumentException("Sold quantity must be positive");
        }
        if (!tracked) {
            return;
        }
        if (stockQuantity == null || stockQuantity.compareTo(quantity) < 0) {
            throw new BusinessException(ErrorCode.PRODUCT_STOCK_INSUFFICIENT);
        }
        stockQuantity = stockQuantity.subtract(quantity);
    }

    public void addStock(BigDecimal quantity) {
        if (quantity == null || quantity.signum() <= 0) {
            throw new IllegalArgumentException("Stock-in quantity must be positive");
        }
        if (!tracked || stockQuantity == null) {
            throw new BusinessException(ErrorCode.PRODUCT_STOCK_IN_UNAVAILABLE);
        }
        BigDecimal result = stockQuantity.add(quantity);
        if (result.compareTo(MAX_STOCK) > 0) {
            throw new BusinessException(ErrorCode.PRODUCT_STOCK_OVERFLOW);
        }
        stockQuantity = result;
    }

    public void restoreStock(BigDecimal quantity) {
        if (!tracked || stockQuantity == null || quantity == null || quantity.signum() <= 0) {
            throw new BusinessException(ErrorCode.SALE_RESTOCK_UNAVAILABLE);
        }
        stockQuantity = stockQuantity.add(quantity);
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
