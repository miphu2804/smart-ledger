package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.smartledger.core.dto.request.CategoryWriteRequest;
import com.smartledger.core.entity.Category;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.CategoryRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.CategoryServiceImpl;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

class CategoryServiceTest {
    private final ShopService shopService = Mockito.mock(ShopService.class);
    private final CategoryRepository categoryRepository = Mockito.mock(CategoryRepository.class);
    private final ProductRepository productRepository = Mockito.mock(ProductRepository.class);
    private final CategoryService service = new CategoryServiceImpl(shopService, categoryRepository, productRepository);

    @BeforeEach
    void authorizeShop() {
        Shop shop = Shop.create(42L, "Tiệm Thảo", "Grocery", null, null);
        ReflectionTestUtils.setField(shop, "id", 7L);
        when(shopService.requireOwnedActiveShop(any(), eq("7"))).thenReturn(shop);
    }

    @Test
    void createsCategoryInSelectedShop() {
        when(categoryRepository.save(any(Category.class))).thenAnswer(invocation -> invocation.getArgument(0));

        var response = service.create(token(), "7", new CategoryWriteRequest("  Đồ uống  "));

        assertThat(response.shopId()).isEqualTo(7L);
        assertThat(response.name()).isEqualTo("Đồ uống");
        assertThat(response.status()).isEqualTo(CatalogStatus.ACTIVE);
        verify(categoryRepository).save(any(Category.class));
    }

    @Test
    void listsOnlyActiveCategoriesInSelectedShop() {
        Category category = category();
        when(categoryRepository.findAllByShopIdAndStatusOrderByIdAsc(7L, CatalogStatus.ACTIVE))
                .thenReturn(java.util.List.of(category));

        var response = service.list(token(), "7");

        assertThat(response).hasSize(1);
        assertThat(response.getFirst().id()).isEqualTo(3L);
        verify(categoryRepository).findAllByShopIdAndStatusOrderByIdAsc(7L, CatalogStatus.ACTIVE);
    }

    @Test
    void renamesCategoryWithoutChangingItsShopOrStatus() {
        Category category = category();
        when(categoryRepository.findByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(category));

        var response = service.replace(token(), "7", "3", new CategoryWriteRequest("  Bánh ngọt  "));

        assertThat(response.name()).isEqualTo("Bánh ngọt");
        assertThat(response.shopId()).isEqualTo(7L);
        assertThat(category.getStatus()).isEqualTo(CatalogStatus.ACTIVE);
    }

    @Test
    void doesNotReadCategoryFromAnotherShop() {
        assertThatThrownBy(() -> service.getById(token(), "7", "3"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.CATEGORY_NOT_FOUND));
        verify(categoryRepository).findByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE);
    }

    @Test
    void cannotArchiveCategoryContainingActiveProducts() {
        Category category = Category.create(7L, "Đồ uống");
        ReflectionTestUtils.setField(category, "id", 3L);
        when(categoryRepository.findByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(category));
        when(productRepository.existsByShopIdAndCategoryIdAndStatus(7L, 3L, CatalogStatus.ACTIVE))
                .thenReturn(true);

        assertThatThrownBy(() -> service.archive(token(), "7", "3"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.CATEGORY_HAS_PRODUCTS));
        assertThat(category.getStatus()).isEqualTo(CatalogStatus.ACTIVE);
    }

    @Test
    void archivesEmptyCategory() {
        Category category = Category.create(7L, "Đồ uống");
        ReflectionTestUtils.setField(category, "id", 3L);
        when(categoryRepository.findByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(category));

        service.archive(token(), "7", "3");

        assertThat(category.getStatus()).isEqualTo(CatalogStatus.ARCHIVED);
        assertThat(category.getArchivedAt()).isNotNull();
        assertThat(category.getArchivedByUserId()).isEqualTo(42L);
        verify(categoryRepository, never()).delete(any());
    }

    @Test
    void archivedCategoryIsUnavailableForReadingOrEditing() {
        assertThatThrownBy(() -> service.getById(token(), "7", "3"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.CATEGORY_NOT_FOUND));
        assertThatThrownBy(() -> service.replace(token(), "7", "3", new CategoryWriteRequest("New")))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.CATEGORY_NOT_FOUND));
    }

    @Test
    void doesNotAccessRepositoryWhenShopIsUnavailable() {
        when(shopService.requireOwnedActiveShop(any(), eq("8")))
                .thenThrow(new BusinessException(ErrorCode.SHOP_ACCESS_DENIED));

        assertThatThrownBy(() -> service.list(token(), "8"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.SHOP_ACCESS_DENIED));
        verify(categoryRepository, never()).findAllByShopIdAndStatusOrderByIdAsc(any(), any());
    }

    @Test
    void rejectsInvalidCategoryIdBeforeQuerying() {
        assertThatThrownBy(() -> service.getById(token(), "7", "abc"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_CATEGORY_ID));
        verify(categoryRepository, never()).findByIdAndShopIdAndStatus(any(), any(), any());
    }

    private VerifiedFirebaseToken token() {
        return Mockito.mock(VerifiedFirebaseToken.class);
    }

    private Category category() {
        Category category = Category.create(7L, "Đồ uống");
        ReflectionTestUtils.setField(category, "id", 3L);
        return category;
    }
}
