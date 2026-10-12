package com.smartledger.core.service.impl;

import com.smartledger.core.dto.request.OwnerListQuery.Products;
import com.smartledger.core.dto.request.ProductPatchRequest;
import com.smartledger.core.dto.request.ProductStockInRequest;
import com.smartledger.core.dto.request.ProductWriteRequest;
import com.smartledger.core.dto.response.PageResponse;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.ApiErrorDetail;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.CategoryRepository;
import com.smartledger.core.repository.OwnerListSpecifications;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.AuditLogService;
import com.smartledger.core.service.IdempotencyService;
import com.smartledger.core.service.NotificationEventService;
import com.smartledger.core.service.ProductService;
import com.smartledger.core.service.ShopService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
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
        String barcode = validateReferencesAndStock(shop.getId(), null, request, true, true);
        Product product = Product.create(shop.getId());
        replaceFields(product, request, barcode);
        product = productRepository.save(product);
        notifications.reconcileStock(shop, product);
        auditLogService.recordOwner(shop, AuditAction.PRODUCT_CREATED, product.getId(), null, null,
                AuditLogService.metadata("sellingPriceVnd", product.getSellingPriceVnd(), "costPriceVnd",
                        product.getCostPriceVnd(), "tracked", product.isTracked(), "stockQuantity", product.getStockQuantity(),
                        "lowStockThreshold", product.getLowStockThreshold()));
        return toResponse(product);
    }

    @Override
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResponse<ProductResponse> list(VerifiedFirebaseToken token, String shopId, Products query) {
        Shop shop = shopService.requireOwnedActiveShop(token, shopId);
        var page = productRepository.findAll(OwnerListSpecifications.products(shop.getId(), query),
                query.pageable(query.ordering()));
        return PageResponse.from(page, this::toResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public ProductResponse getById(VerifiedFirebaseToken firebaseToken, String shopId, String productId) {
        Shop shop = shopService.requireOwnedActiveShop(firebaseToken, shopId);
        return toResponse(requireActiveProduct(shop.getId(), productId));
    }

    @Override
    @Transactional(readOnly = true)
    public ProductResponse lookup(VerifiedFirebaseToken firebaseToken, String shopId, String barcode) {
        Shop shop = shopService.requireOwnedActiveShop(firebaseToken, shopId);
        String normalized = normalizeBarcode(barcode);
        if (normalized == null) {
            throw invalidBarcode("is required");
        }
        return productRepository.findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(
                        shop.getId(), normalized, CatalogStatus.ACTIVE)
                .map(this::toResponse)
                .orElseThrow(() -> new BusinessException(ErrorCode.PRODUCT_NOT_FOUND));
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
        String barcode = validateReferencesAndStock(shop.getId(), product.getId(), merged,
                request.hasField("categoryId"), request.hasField("barcode"));
        Long beforePrice = product.getSellingPriceVnd();
        BigDecimal beforeStock = product.getStockQuantity();
        boolean beforeTracked = product.isTracked();
        replaceFields(product, merged, barcode);
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

    private String validateReferencesAndStock(Long shopId, Long currentProductId, ProductWriteRequest request,
            boolean validateCategory, boolean validateBarcode) {
        if (validateCategory && request.categoryId() != null && !categoryRepository.existsByIdAndShopIdAndStatus(
                request.categoryId(), shopId, CatalogStatus.ACTIVE)) {
            throw new BusinessException(ErrorCode.PRODUCT_CATEGORY_INVALID);
        }

        // An omitted PATCH field must remain unchanged, including legacy barcode values.
        String barcode = validateBarcode ? normalizeBarcode(request.barcode()) : request.barcode();
        if (validateBarcode && barcode != null) {
            var duplicate = currentProductId == null
                    ? productRepository.findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(
                            shopId, barcode, CatalogStatus.ACTIVE)
                    : productRepository.findFirstByShopIdAndBarcodeAndStatusAndIdNotOrderByIdDesc(
                            shopId, barcode, CatalogStatus.ACTIVE, currentProductId);
            duplicate.ifPresent(conflict -> {
                throw new BusinessException(ErrorCode.PRODUCT_BARCODE_CONFLICT,
                        List.of(new ApiErrorDetail("barcode", "already_in_use",
                                conflict.getId(), conflict.getStatus())));
            });
        }

        BigDecimal stock = request.stockQuantity();
        if (Boolean.TRUE.equals(request.tracked()) && stock == null) {
            throw new BusinessException(ErrorCode.PRODUCT_STOCK_REQUIRED);
        }
        if (Boolean.FALSE.equals(request.tracked()) && stock != null) {
            throw new BusinessException(ErrorCode.PRODUCT_STOCK_NOT_TRACKED);
        }
        return barcode;
    }

    private void replaceFields(Product product, ProductWriteRequest request, String barcode) {
        product.replace(
                request.categoryId(),
                request.name().trim(),
                barcode,
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

    /** Trims boundary whitespace only, then validates the remaining exact barcode without rewriting it. */
    private String normalizeBarcode(String raw) {
        if (raw == null) {
            return null;
        }
        // Include Unicode spaces and scanner CR/LF/TAB suffixes, but never trim other control characters.
        int start = 0;
        int end = raw.length();
        while (start < end && isBarcodePadding(raw.charAt(start))) {
            start++;
        }
        while (end > start && isBarcodePadding(raw.charAt(end - 1))) {
            end--;
        }
        String barcode = raw.substring(start, end);
        if (barcode.isEmpty()) {
            return null;
        }
        if (barcode.codePointCount(0, barcode.length()) > 100) {
            throw invalidBarcode("must not exceed 100 Unicode code points after trim");
        }
        if (barcode.codePoints().anyMatch(character -> Character.isWhitespace(character)
                || Character.isSpaceChar(character) || Character.isISOControl(character))) {
            throw invalidBarcode("must not contain internal whitespace or control characters");
        }
        return barcode;
    }

    private boolean isBarcodePadding(char character) {
        return Character.isWhitespace(character) || Character.isSpaceChar(character);
    }

    private BusinessException invalidBarcode(String issue) {
        return new BusinessException(ErrorCode.INVALID_PRODUCT_BARCODE,
                List.of(new ApiErrorDetail("barcode", issue)));
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
