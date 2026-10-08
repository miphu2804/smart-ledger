package com.smartledger.core.service.impl;

import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.service.AuditLogService;
import com.smartledger.core.dto.request.ProductPatchRequest;
import com.smartledger.core.dto.request.ProductStockInRequest;
import com.smartledger.core.dto.request.ProductWriteRequest;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.ApiErrorDetail;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.CategoryRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.ProductService;
import com.smartledger.core.service.NotificationEventService;
import com.smartledger.core.service.IdempotencyService;
import com.smartledger.core.service.ShopService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class ProductServiceImpl implements ProductService {
    private final AuditLogService auditLogService;
    private final NotificationEventService notifications;

    private final ShopService shopService;
    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final IdempotencyService idempotencyService;

    public ProductServiceImpl(
            ShopService shopService,
            ProductRepository productRepository,
            CategoryRepository categoryRepository, AuditLogService auditLogService,
            IdempotencyService idempotencyService, NotificationEventService notifications) {
        this.notifications = notifications;
        this.auditLogService = auditLogService;
        this.shopService = shopService;
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
        this.idempotencyService = idempotencyService;
    }

    @Override
    @Transactional
    public ProductResponse create(VerifiedFirebaseToken firebaseToken, String shopId, ProductWriteRequest request) {
        if (StringUtils.hasText(request.imageUrl())) {
            throw new BusinessException(ErrorCode.PRODUCT_IMAGE_URL_UNSUPPORTED);
        }
        Shop shop = shopService.requireOwnedActiveShop(firebaseToken, shopId);
        validateReferencesAndStock(shop.getId(), null, request, true, true);
        Product product = Product.create(shop.getId());
        replaceFields(product, request);
        product = productRepository.save(product);
        notifications.reconcileStock(shop, product);
        auditLogService.recordOwner(shop, AuditAction.PRODUCT_CREATED, product.getId(), null, null,
                AuditLogService.metadata("sellingPriceVnd", product.getSellingPriceVnd(), "costPriceVnd",
                        product.getCostPriceVnd(), "tracked", product.isTracked(), "stockQuantity", product.getStockQuantity(),
                        "lowStockThreshold", product.getLowStockThreshold()));
        return toResponse(product);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ProductResponse> list(VerifiedFirebaseToken firebaseToken, String shopId) {
        Shop shop = shopService.requireOwnedActiveShop(firebaseToken, shopId);
        return productRepository.findAllByShopIdAndStatusOrderByIdAsc(shop.getId(), CatalogStatus.ACTIVE)
                .stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public ProductResponse getById(VerifiedFirebaseToken firebaseToken, String shopId, String productId) {
        Shop shop = shopService.requireOwnedActiveShop(firebaseToken, shopId);
        return toResponse(requireActiveProduct(shop.getId(), productId));
    }

    @Override
    @Transactional
    public ProductResponse patch(
            VerifiedFirebaseToken firebaseToken,
            String shopId,
            String productId,
            ProductPatchRequest request) {
        if (request.hasField("imageUrl")) {
            throw new BusinessException(ErrorCode.PRODUCT_IMAGE_URL_UNSUPPORTED);
        }
        Shop shop = shopService.requireOwnedActiveShop(firebaseToken, shopId);
        Product product = requireLockedActiveProduct(shop.getId(), productId);
        ProductWriteRequest merged = merge(product, request);
        validateReferencesAndStock(shop.getId(), product.getId(), merged,
                request.hasField("categoryId"), request.hasField("barcode"));
        Long beforePrice = product.getSellingPriceVnd();
        BigDecimal beforeStock = product.getStockQuantity();
        boolean beforeTracked = product.isTracked();
        replaceFields(product, merged);
        notifications.reconcileStock(shop, product);
        auditLogService.recordOwner(shop, AuditAction.PRODUCT_UPDATED, product.getId(), null, null,
                Map.of("beforeSellingPriceVnd", beforePrice, "afterSellingPriceVnd", product.getSellingPriceVnd(),
                        "changedFields", request.getProvidedFields().stream().sorted().toList()));
        boolean stockChanged = beforeStock == null ? product.getStockQuantity() != null
                : product.getStockQuantity() == null || beforeStock.compareTo(product.getStockQuantity()) != 0;
        if (stockChanged || beforeTracked != product.isTracked()) {
            auditLogService.recordOwner(shop, AuditAction.STOCK_ADJUSTED, product.getId(), null, null,
                    AuditLogService.metadata("source", "CATALOG_EDIT", "beforeStock", beforeStock,
                            "afterStock", product.getStockQuantity(), "beforeTracked", beforeTracked,
                            "afterTracked", product.isTracked()));
        }
        return toResponse(product);
    }

    private ProductWriteRequest merge(Product product, ProductPatchRequest request) {
        boolean tracked = request.hasField("tracked") ? request.getTracked() : product.isTracked();
        BigDecimal stock = !tracked ? null : !product.isTracked() ? BigDecimal.ZERO : product.getStockQuantity();
        return new ProductWriteRequest(
                request.hasField("categoryId") ? request.getCategoryId() : product.getCategoryId(),
                request.hasField("name") ? request.getName() : product.getName(),
                request.hasField("barcode") ? request.getBarcode() : product.getBarcode(),
                request.hasField("imageUrl") ? request.getImageUrl() : product.getImageUrl(),
                request.hasField("unit") ? request.getUnit() : product.getUnit(),
                request.hasField("sellingPriceVnd") ? request.getSellingPriceVnd() : product.getSellingPriceVnd(),
                request.hasField("costPriceVnd") ? request.getCostPriceVnd() : product.getCostPriceVnd(),
                tracked,
                stock,
                request.hasField("lowStockThreshold") ? request.getLowStockThreshold() : product.getLowStockThreshold());
    }

    @Override
    @Transactional
    public ProductResponse stockIn(VerifiedFirebaseToken firebaseToken, String shopId, String productId,
            String idempotencyKey, ProductStockInRequest request) {
        Shop shop = shopService.requireOwnedActiveShop(firebaseToken, shopId);
        Long id = parseProductId(productId);
        ProductStockInRequest normalized = new ProductStockInRequest(
                request.quantity().stripTrailingZeros(), normalizeOptional(request.reason()));
        // Reserve before locking the product; retries replay without changing stock or auditing again.
        return idempotencyService.execute(shop.getId(), shop.getOwnerId(), "PRODUCT_STOCK_IN", idempotencyKey,
                new Object[] {id, normalized}, "PRODUCT", ProductResponse::id, ProductResponse.class, 200, () -> {
                    Product product = requireLockedActiveProduct(shop.getId(), id.toString());
                    BigDecimal before = product.getStockQuantity();
                    product.addStock(normalized.quantity());
                    notifications.reconcileStock(shop, product);
                    auditLogService.recordOwner(shop, AuditAction.STOCK_ADJUSTED, product.getId(),
                            normalized.reason(), idempotencyKey.trim(), AuditLogService.metadata(
                                    "source", "STOCK_IN", "quantity", normalized.quantity(),
                                    "beforeStock", before, "afterStock", product.getStockQuantity()));
                    productRepository.flush();
                    return toResponse(product);
                });
    }

    @Override
    @Transactional
    public void archive(VerifiedFirebaseToken firebaseToken, String shopId, String productId) {
        Shop shop = shopService.requireOwnedActiveShop(firebaseToken, shopId);
        Product product = requireLockedActiveProduct(shop.getId(), productId);
        product.archive(shop.getOwnerId());
        notifications.reconcileStock(shop, product);
        auditLogService.recordOwner(shop, AuditAction.PRODUCT_ARCHIVED, product.getId(), null, null, Map.of());
    }

    private Product requireActiveProduct(Long shopId, String productId) {
        return productRepository.findByIdAndShopIdAndStatus(
                        parseProductId(productId), shopId, CatalogStatus.ACTIVE)
                .orElseThrow(() -> new BusinessException(ErrorCode.PRODUCT_NOT_FOUND));
    }

    private Product requireLockedActiveProduct(Long shopId, String productId) {
        return productRepository.findLockedByIdAndShopIdAndStatus(
                        parseProductId(productId), shopId, CatalogStatus.ACTIVE)
                .orElseThrow(() -> new BusinessException(ErrorCode.PRODUCT_NOT_FOUND));
    }

    private Long parseProductId(String productId) {
        try {
            long id = Long.parseLong(productId);
            if (id > 0) {
                return id;
            }
        } catch (NumberFormatException ignored) {
            // Fall through to the same public validation error.
        }
        throw new BusinessException(
                ErrorCode.INVALID_PRODUCT_ID,
                List.of(new ApiErrorDetail("productId", "must be a positive integer")));
    }

    private void validateReferencesAndStock(Long shopId, Long currentProductId, ProductWriteRequest request,
            boolean validateCategory, boolean validateBarcode) {
        if (validateCategory && request.categoryId() != null && !categoryRepository.existsByIdAndShopIdAndStatus(
                request.categoryId(), shopId, CatalogStatus.ACTIVE)) {
            throw new BusinessException(ErrorCode.PRODUCT_CATEGORY_INVALID);
        }

        String barcode = normalizeOptional(request.barcode());
        if (validateBarcode && barcode != null) {
            boolean duplicate = currentProductId == null
                    ? productRepository.existsByShopIdAndBarcode(shopId, barcode)
                    : productRepository.existsByShopIdAndBarcodeAndIdNot(shopId, barcode, currentProductId);
            if (duplicate) {
                throw new BusinessException(ErrorCode.PRODUCT_BARCODE_CONFLICT);
            }
        }

        BigDecimal stock = request.stockQuantity();
        if (Boolean.TRUE.equals(request.tracked()) && stock == null) {
            throw new BusinessException(ErrorCode.PRODUCT_STOCK_REQUIRED);
        }
        if (Boolean.FALSE.equals(request.tracked()) && stock != null) {
            throw new BusinessException(ErrorCode.PRODUCT_STOCK_NOT_TRACKED);
        }
    }

    private void replaceFields(Product product, ProductWriteRequest request) {
        product.replace(
                request.categoryId(),
                request.name().trim(),
                normalizeOptional(request.barcode()),
                normalizeOptional(request.imageUrl()),
                request.unit().trim(),
                request.sellingPriceVnd(),
                request.costPriceVnd(),
                request.tracked(),
                request.stockQuantity());
        product.setLowStockThreshold(request.lowStockThreshold());
    }

    private String normalizeOptional(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private ProductResponse toResponse(Product product) {
        return new ProductResponse(
                product.getId(),
                product.getShopId(),
                product.getCategoryId(),
                product.getName(),
                product.getBarcode(),
                product.getImageUrl(),
                product.getUnit(),
                product.getSellingPriceVnd(),
                product.getCostPriceVnd(),
                product.isTracked(),
                product.getStockQuantity(),
                product.getStatus(),
                product.getCreatedAt(),
                product.getUpdatedAt(),
                product.getLowStockThreshold());
    }
}
