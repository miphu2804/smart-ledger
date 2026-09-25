package com.smartledger.core.service.impl;

import com.smartledger.core.dto.request.CategoryWriteRequest;
import com.smartledger.core.dto.response.CategoryResponse;
import com.smartledger.core.entity.Category;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.ApiErrorDetail;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.CategoryRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.CategoryService;
import com.smartledger.core.service.ShopService;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CategoryServiceImpl implements CategoryService {
    private final ShopService shopService;
    private final CategoryRepository categoryRepository;
    private final ProductRepository productRepository;

    public CategoryServiceImpl(ShopService shopService, CategoryRepository categoryRepository,
            ProductRepository productRepository) {
        this.shopService = shopService;
        this.categoryRepository = categoryRepository;
        this.productRepository = productRepository;
    }

    @Override
    @Transactional
    public CategoryResponse create(VerifiedFirebaseToken firebaseToken, String shopId, CategoryWriteRequest request) {
        Shop shop = shopService.requireOwnedActiveShop(firebaseToken, shopId);
        return toResponse(categoryRepository.save(Category.create(shop.getId(), request.name().trim())));
    }

    @Override
    @Transactional(readOnly = true)
    public List<CategoryResponse> list(VerifiedFirebaseToken firebaseToken, String shopId) {
        Shop shop = shopService.requireOwnedActiveShop(firebaseToken, shopId);
        return categoryRepository.findAllByShopIdAndStatusOrderByIdAsc(shop.getId(), CatalogStatus.ACTIVE)
                .stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public CategoryResponse getById(VerifiedFirebaseToken firebaseToken, String shopId, String categoryId) {
        Shop shop = shopService.requireOwnedActiveShop(firebaseToken, shopId);
        return toResponse(requireActiveCategory(shop.getId(), categoryId));
    }

    @Override
    @Transactional
    public CategoryResponse replace(VerifiedFirebaseToken firebaseToken, String shopId, String categoryId,
            CategoryWriteRequest request) {
        Shop shop = shopService.requireOwnedActiveShop(firebaseToken, shopId);
        Category category = requireActiveCategory(shop.getId(), categoryId);
        category.rename(request.name().trim());
        return toResponse(category);
    }

    @Override
    @Transactional
    public void archive(VerifiedFirebaseToken firebaseToken, String shopId, String categoryId) {
        Shop shop = shopService.requireOwnedActiveShop(firebaseToken, shopId);
        Category category = requireActiveCategory(shop.getId(), categoryId);
        if (productRepository.existsByShopIdAndCategoryIdAndStatus(
                shop.getId(), category.getId(), CatalogStatus.ACTIVE)) {
            throw new BusinessException(ErrorCode.CATEGORY_HAS_PRODUCTS);
        }
        category.archive(shop.getOwnerId());
    }

    private Category requireActiveCategory(Long shopId, String categoryId) {
        return categoryRepository.findByIdAndShopIdAndStatus(parseCategoryId(categoryId), shopId, CatalogStatus.ACTIVE)
                .orElseThrow(() -> new BusinessException(ErrorCode.CATEGORY_NOT_FOUND));
    }

    private Long parseCategoryId(String categoryId) {
        try {
            long id = Long.parseLong(categoryId);
            if (id > 0) {
                return id;
            }
        } catch (NumberFormatException ignored) {
            // Return the same validation error for all invalid identifiers.
        }
        throw new BusinessException(ErrorCode.INVALID_CATEGORY_ID,
                List.of(new ApiErrorDetail("categoryId", "must be a positive integer")));
    }

    private CategoryResponse toResponse(Category category) {
        return new CategoryResponse(category.getId(), category.getShopId(), category.getName(),
                category.getStatus(), category.getCreatedAt(), category.getUpdatedAt());
    }
}
