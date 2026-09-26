package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.smartledger.core.dto.request.ProductWriteRequest;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.CategoryRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.ProductServiceImpl;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;

class ProductServiceTest {

    private final ShopService shopService = Mockito.mock(ShopService.class);
    private final ProductRepository productRepository = Mockito.mock(ProductRepository.class);
    private final CategoryRepository categoryRepository = Mockito.mock(CategoryRepository.class);
    private final ProductService service = new ProductServiceImpl(shopService, productRepository, categoryRepository);

    @BeforeEach
    void authorizeShop() {
        Shop shop = Shop.create(42L, "Tiệm Thảo", "Grocery", null, null);
        ReflectionTestUtils.setField(shop, "id", 7L);
        when(shopService.requireOwnedActiveShop(any(), eq("7"))).thenReturn(shop);
    }

    @Test
    void createsAnUntrackedProductInTheSelectedShop() {
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ProductResponse response = service.create(token(), "7", request(null, null, false, null));

        assertThat(response.shopId()).isEqualTo(7L);
        assertThat(response.name()).isEqualTo("Cà phê");
        assertThat(response.status()).isEqualTo(CatalogStatus.ACTIVE);
        assertThat(response.stockQuantity()).isNull();
        verify(productRepository).save(any(Product.class));
    }

    @Test
    void rejectsCategoryOutsideTheSelectedShopOrArchived() {
        ProductWriteRequest request = request(10L, null, false, null);

        assertThatThrownBy(() -> service.create(token(), "7", request))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_CATEGORY_INVALID));

        verify(categoryRepository).existsByIdAndShopIdAndStatus(10L, 7L, CatalogStatus.ACTIVE);
        verify(productRepository, never()).save(any());
    }

    @Test
    void createsTrackedProductWithActiveCategoryInTheSameShop() {
        when(categoryRepository.existsByIdAndShopIdAndStatus(10L, 7L, CatalogStatus.ACTIVE)).thenReturn(true);
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ProductResponse response = service.create(token(), "7", request(10L, " 123456 ", true,
                new BigDecimal("2.500")));

        assertThat(response.categoryId()).isEqualTo(10L);
        assertThat(response.barcode()).isEqualTo("123456");
        assertThat(response.tracked()).isTrue();
        assertThat(response.stockQuantity()).isEqualByComparingTo("2.500");
        verify(productRepository).existsByShopIdAndBarcode(7L, "123456");
    }

    @Test
    void archivedProductKeepsItsBarcodeReservedAccordingToTheCurrentErd() {
        when(productRepository.existsByShopIdAndBarcode(7L, "123456"))
                .thenReturn(true);

        assertThatThrownBy(() -> service.create(token(), "7", request(null, "123456", false, null)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_BARCODE_CONFLICT));
    }

    @Test
    void barcodeMayBeUsedByAnotherShop() {
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ProductResponse response = service.create(token(), "7", request(null, "123456", false, null));

        assertThat(response.barcode()).isEqualTo("123456");
        verify(productRepository).existsByShopIdAndBarcode(7L, "123456");
    }

    @Test
    void validatesSimpleStockTracking() {
        assertThatThrownBy(() -> service.create(token(), "7", request(null, null, true, null)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_STOCK_REQUIRED));

        assertThatThrownBy(() -> service.create(token(), "7", request(null, null, false, BigDecimal.ONE)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_STOCK_NOT_TRACKED));
    }

    @Test
    void neverReadsAProductFromAnotherShop() {
        when(productRepository.findByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getById(token(), "7", "3"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_NOT_FOUND));
    }

    @Test
    void rejectsInvalidProductIdBeforeQuerying() {
        assertThatThrownBy(() -> service.getById(token(), "7", "bad-id"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_PRODUCT_ID));
        verify(productRepository, never()).findByIdAndShopIdAndStatus(any(), any(), any());
    }

    @Test
    void getsActiveProductInSelectedShop() {
        when(productRepository.findByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product()));

        ProductResponse response = service.getById(token(), "7", "3");

        assertThat(response.id()).isEqualTo(3L);
        assertThat(response.shopId()).isEqualTo(7L);
    }

    @Test
    void listsOnlyActiveProductsFromTheSelectedShop() {
        Product product = product();
        when(productRepository.findAllByShopIdAndStatusOrderByIdAsc(7L, CatalogStatus.ACTIVE))
                .thenReturn(List.of(product));

        assertThat(service.list(token(), "7")).hasSize(1);
        verify(productRepository).findAllByShopIdAndStatusOrderByIdAsc(7L, CatalogStatus.ACTIVE);
    }

    @Test
    void fullReplacementCanClearOptionalFields() {
        Product product = product();
        when(productRepository.findByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));

        ProductResponse response = service.replace(token(), "7", "3", request(null, null, false, null));

        assertThat(response.categoryId()).isNull();
        assertThat(response.barcode()).isNull();
        assertThat(response.stockQuantity()).isNull();
    }

    @Test
    void rejectsDuplicateBarcodeOnReplacement() {
        Product product = product();
        when(productRepository.findByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));
        when(productRepository.existsByShopIdAndBarcodeAndIdNot(7L, "654321", 3L)).thenReturn(true);

        assertThatThrownBy(() -> service.replace(token(), "7", "3",
                request(null, "654321", false, null)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_BARCODE_CONFLICT));
        assertThat(product.getBarcode()).isEqualTo("123456");
    }

    @Test
    void rejectsArchivedOrMissingProductForUpdateAndArchive() {
        assertThatThrownBy(() -> service.replace(token(), "7", "3", request(null, null, false, null)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_NOT_FOUND));
        assertThatThrownBy(() -> service.archive(token(), "7", "3"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_NOT_FOUND));
    }

    @Test
    void doesNotAccessProductRepositoryWhenShopIsUnavailable() {
        when(shopService.requireOwnedActiveShop(any(), eq("8")))
                .thenThrow(new BusinessException(ErrorCode.SHOP_INACTIVE));

        assertThatThrownBy(() -> service.list(token(), "8"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.SHOP_INACTIVE));
        verify(productRepository, never()).findAllByShopIdAndStatusOrderByIdAsc(any(), any());
    }

    @Test
    void archivesWithoutDeletingAndRecordsTheOwner() {
        Product product = product();
        when(productRepository.findByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));

        service.archive(token(), "7", "3");

        assertThat(product.getStatus()).isEqualTo(CatalogStatus.ARCHIVED);
        assertThat(product.getArchivedAt()).isNotNull();
        assertThat(product.getArchivedByUserId()).isEqualTo(42L);
        verify(productRepository, never()).delete(any());
    }

    private Product product() {
        Product product = Product.create(7L);
        ReflectionTestUtils.setField(product, "id", 3L);
        product.replace(10L, "Cà phê", "123456", null, "ly", 25000L, 10000L, true,
                new BigDecimal("10.000"));
        return product;
    }

    private ProductWriteRequest request(Long categoryId, String barcode, boolean tracked, BigDecimal stock) {
        return new ProductWriteRequest(categoryId, " Cà phê ", barcode, null, " ly ", 25000L, 10000L,
                tracked, stock);
    }

    private VerifiedFirebaseToken token() {
        return new VerifiedFirebaseToken("uid", null, false, null, null, null);
    }
}
