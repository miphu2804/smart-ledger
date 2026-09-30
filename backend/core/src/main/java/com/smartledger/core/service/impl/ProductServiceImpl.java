package com.smartledger.core.service.impl;

import com.smartledger.core.dto.request.ProductPatchRequest;
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
import com.smartledger.core.service.ShopService;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class ProductServiceImpl implements ProductService {

    private final ShopService shopService;
    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;

    public ProductServiceImpl(
            ShopService shopService,
            ProductRepository productRepository,
            CategoryRepository categoryRepository) {
        this.shopService = shopService;
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
    }

    @Override
    @Transactional
    public ProductResponse create(VerifiedFirebaseToken firebaseToken, String shopId, ProductWriteRequest request) {
        Shop shop = shopService.requireOwnedActiveShop(firebaseToken, shopId);
        validateReferencesAndStock(shop.getId(), null, request, true, true);
        Product product = Product.create(shop.getId());
        replaceFields(product, request);
        return toResponse(productRepository.save(product));
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
        Shop shop = shopService.requireOwnedActiveShop(firebaseToken, shopId);
        Product product = requireLockedActiveProduct(shop.getId(), productId);
        ProductWriteRequest merged = merge(product, request);
        validateReferencesAndStock(shop.getId(), product.getId(), merged,
                request.hasField("categoryId"), request.hasField("barcode"));
        replaceFields(product, merged);
        return toResponse(product);
    }

    private ProductWriteRequest merge(Product product, ProductPatchRequest request) {
        boolean tracked = request.hasField("tracked") ? request.getTracked() : product.isTracked();
        BigDecimal stock = request.hasField("stockQuantity") ? request.getStockQuantity()
                : request.hasField("tracked") && !tracked ? null : product.getStockQuantity();
        return new ProductWriteRequest(
                request.hasField("categoryId") ? request.getCategoryId() : product.getCategoryId(),
                request.hasField("name") ? request.getName() : product.getName(),
                request.hasField("barcode") ? request.getBarcode() : product.getBarcode(),
                request.hasField("imageUrl") ? request.getImageUrl() : product.getImageUrl(),
                request.hasField("unit") ? request.getUnit() : product.getUnit(),
                request.hasField("sellingPriceVnd") ? request.getSellingPriceVnd() : product.getSellingPriceVnd(),
                request.hasField("costPriceVnd") ? request.getCostPriceVnd() : product.getCostPriceVnd(),
                tracked,
                stock);
    }

    @Override
    @Transactional
    public void archive(VerifiedFirebaseToken firebaseToken, String shopId, String productId) {
        Shop shop = shopService.requireOwnedActiveShop(firebaseToken, shopId);
        Product product = requireLockedActiveProduct(shop.getId(), productId);
        product.archive(shop.getOwnerId());
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
                product.getUpdatedAt());
    }
}
