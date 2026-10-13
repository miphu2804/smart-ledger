package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.smartledger.core.dto.request.CategoryWriteRequest;
import com.smartledger.core.entity.Category;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.CategoryRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.CategoryServiceImpl;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

class CategoryServiceTest {
    private final ShopService shopService = Mockito.mock(ShopService.class);
    private final CategoryRepository categoryRepository = Mockito.mock(CategoryRepository.class);
    private final ProductRepository productRepository = Mockito.mock(ProductRepository.class);
    private final AuditLogService auditLogService = Mockito.mock(AuditLogService.class);
    private final EntityManager entityManager = Mockito.mock(EntityManager.class);
    private final CategoryService service = new CategoryServiceImpl(shopService, categoryRepository,
            productRepository, auditLogService, entityManager);

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
        when(categoryRepository.findLockedByIdAndShopId(3L, 7L))
                .thenReturn(Optional.of(category));

        var response = service.replace(token(), "7", "3", new CategoryWriteRequest("  Bánh ngọt  "));

        assertThat(response.name()).isEqualTo("Bánh ngọt");
        assertThat(response.shopId()).isEqualTo(7L);
        assertThat(category.getStatus()).isEqualTo(CatalogStatus.ACTIVE);
        var order = inOrder(categoryRepository, entityManager, auditLogService);
        order.verify(categoryRepository).findLockedByIdAndShopId(3L, 7L);
        order.verify(entityManager).refresh(category, LockModeType.PESSIMISTIC_WRITE);
        order.verify(auditLogService).recordOwner(any(), eq(AuditAction.CATEGORY_UPDATED),
                eq(3L), eq(null), eq(null), eq(Map.of("changedFields", List.of("name"))));
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
        when(categoryRepository.findLockedByIdAndShopId(3L, 7L))
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
        when(categoryRepository.findLockedByIdAndShopId(3L, 7L))
                .thenReturn(Optional.of(category));

        service.archive(token(), "7", "3");

        assertThat(category.getStatus()).isEqualTo(CatalogStatus.ARCHIVED);
        assertThat(category.getArchivedAt()).isNotNull();
        assertThat(category.getArchivedByUserId()).isEqualTo(42L);
        verify(categoryRepository, never()).delete(any());
        var order = inOrder(categoryRepository, entityManager, productRepository, auditLogService);
        order.verify(categoryRepository).findLockedByIdAndShopId(3L, 7L);
        order.verify(entityManager).refresh(category, LockModeType.PESSIMISTIC_WRITE);
        order.verify(productRepository).existsByShopIdAndCategoryIdAndStatus(7L, 3L, CatalogStatus.ACTIVE);
        order.verify(auditLogService).recordOwner(any(), eq(AuditAction.CATEGORY_ARCHIVED),
                eq(3L), eq(null), eq(null), eq(Map.of()));
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void checksRefreshedStatusBeforeEditingOrArchiving(boolean archive) {
        Category category = category();
        when(categoryRepository.findLockedByIdAndShopId(3L, 7L)).thenReturn(Optional.of(category));
        doAnswer(invocation -> { category.archive(42L); return null; }).when(entityManager)
                .refresh(category, LockModeType.PESSIMISTIC_WRITE);

        assertThatThrownBy(() -> {
            if (archive) service.archive(token(), "7", "3");
            else service.replace(token(), "7", "3", new CategoryWriteRequest("New"));
        }).isInstanceOfSatisfying(BusinessException.class, error ->
                assertThat(error.getErrorCode()).isEqualTo(ErrorCode.CATEGORY_NOT_FOUND));
        assertThat(category.getName()).isEqualTo("Đồ uống");
        assertThat(category.getArchivedByUserId()).isEqualTo(42L);
        verifyNoInteractions(productRepository, auditLogService);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void missingOrForeignCategoryCannotBeWritten(boolean archive) {
        assertThatThrownBy(() -> {
            if (archive) service.archive(token(), "7", "3");
            else service.replace(token(), "7", "3", new CategoryWriteRequest("New"));
        }).isInstanceOfSatisfying(BusinessException.class, error ->
                assertThat(error.getErrorCode()).isEqualTo(ErrorCode.CATEGORY_NOT_FOUND));
        verify(categoryRepository).findLockedByIdAndShopId(3L, 7L);
        verifyNoInteractions(entityManager, productRepository, auditLogService);
    }

    @Test
    void detailReadDoesNotTakeWriteLock() {
        when(categoryRepository.findByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(category()));
        assertThat(service.getById(token(), "7", "3").name()).isEqualTo("Đồ uống");
        verify(categoryRepository, never()).findLockedByIdAndShopId(any(), any());
        verifyNoInteractions(entityManager);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void rejectsInvalidWriteIdBeforeLocking(boolean archive) {
        assertThatThrownBy(() -> {
            if (archive) service.archive(token(), "7", "abc");
            else service.replace(token(), "7", "abc", new CategoryWriteRequest("New"));
        }).isInstanceOfSatisfying(BusinessException.class, error ->
                assertThat(error.getErrorCode()).isEqualTo(ErrorCode.INVALID_CATEGORY_ID));
        verifyNoInteractions(categoryRepository, entityManager, productRepository, auditLogService);
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
