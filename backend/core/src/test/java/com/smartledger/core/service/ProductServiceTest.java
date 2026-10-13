package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.smartledger.core.dto.request.OwnerListQuery.*;
import com.smartledger.core.dto.request.ProductPatchRequest;
import com.smartledger.core.dto.request.ProductWriteRequest;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.exception.ApiErrorDetail;
import com.smartledger.core.repository.CategoryRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.ProductServiceImpl;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.Mockito;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.test.util.ReflectionTestUtils;

class ProductServiceTest {

    private final ShopService shopService = Mockito.mock(ShopService.class);
    private final ProductRepository productRepository = Mockito.mock(ProductRepository.class);
    private final CategoryRepository categoryRepository = Mockito.mock(CategoryRepository.class);
    private final AuditLogService auditLogService = Mockito.mock(AuditLogService.class);
    private final IdempotencyService idempotencyService = Mockito.mock(IdempotencyService.class);
    private final ProductService service = new ProductServiceImpl(shopService, productRepository, categoryRepository,
            auditLogService, idempotencyService, Mockito.mock(NotificationEventService.class));

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
    void rejectsRawProductImageUrlOnCreate() {
        ProductWriteRequest request = new ProductWriteRequest(null, "Cà phê", null,
                "https://untrusted.example/image.png", "ly", 25000L, 10000L, false, null);

        assertThatThrownBy(() -> service.create(token(), "7", request))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_IMAGE_URL_UNSUPPORTED));

        verify(productRepository, never()).save(any());
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
        verify(productRepository).findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(7L, "123456", CatalogStatus.ACTIVE);
    }

    @Test
    void activeProductKeepsItsBarcodeReservedAndReturnsConflictDetails() {
        when(productRepository.findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(7L, "123456", CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product()));

        assertThatThrownBy(() -> service.create(token(), "7", request(null, "123456", false, null)))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_BARCODE_CONFLICT);
                    assertThat(exception.getDetails()).containsExactly(
                            new ApiErrorDetail("barcode", "already_in_use", 3L, CatalogStatus.ACTIVE));
                });
        verify(productRepository, never()).save(any());
        verifyNoInteractions(auditLogService);
    }

    @Test
    void createPrecheckOnlyConsidersActiveProducts() {
        // V16 reuse and the final DB unique guard are covered separately on PostgreSQL.
        when(productRepository.findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(7L, "123456", CatalogStatus.ACTIVE))
                .thenReturn(Optional.empty());
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));

        assertThat(service.create(token(), "7", request(null, "123456", false, null)).barcode()).isEqualTo("123456");
        verify(productRepository).findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(7L, "123456", CatalogStatus.ACTIVE);
    }

    @Test
    void barcodeMayBeUsedByAnotherShop() {
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));

        ProductResponse response = service.create(token(), "7", request(null, "123456", false, null));

        assertThat(response.barcode()).isEqualTo("123456");
        verify(productRepository).findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(7L, "123456", CatalogStatus.ACTIVE);
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
        when(productRepository.findAll(org.mockito.ArgumentMatchers.<Specification<com.smartledger.core.entity.Product>>any(), org.mockito.ArgumentMatchers.any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(product)));

        assertThat(service.list(token(), "7", Products.defaults()).items()).hasSize(1);
        verify(productRepository).findAll(org.mockito.ArgumentMatchers.<Specification<com.smartledger.core.entity.Product>>any(), org.mockito.ArgumentMatchers.any(Pageable.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"ABC-123", "  ABC-123  ", "ABC-123\r\n", "\tABC-123\t", "123", "abc-123"})
    void createPreservesTheExactBarcodeAfterTrim(String raw) {
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));

        assertThat(service.create(token(), "7", request(null, raw, false, null)).barcode()).isEqualTo(raw.trim());
        verify(productRepository).findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(7L, raw.trim(), CatalogStatus.ACTIVE);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", " \t\r\n ", "\u2003\u00a0"})
    void createAcceptsNoBarcodeAndPatchClearsIt(String raw) {
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));
        assertThat(service.create(token(), "7", request(null, raw, false, null)).barcode()).isNull();

        when(productRepository.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product()));
        ProductPatchRequest patch = new ProductPatchRequest();
        patch.setBarcode(raw);
        assertThat(service.patch(token(), "7", "3", patch).barcode()).isNull();
        verify(productRepository, never()).findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(any(), any(), any());
        verify(productRepository, never()).findFirstByShopIdAndBarcodeAndStatusAndIdNotOrderByIdDesc(any(), any(), any(), any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"ABC 123", "ABC\t123", "ABC\n123", "ABC\r123", "ABC\u0000123",
            "ABC\u007f123", "ABC\u0085123", "ABC\u00a0123", "ABC\u2003123", "\u0000ABC", "ABC\u007f",
            "\u000BABC", "ABC\u000B", "\u000B", "\u000CABC", "ABC\u000C", "\u000C",
            "\u001CABC", "ABC\u001C", "\u001C", "\u001DABC", "ABC\u001D", "\u001D",
            "\u001EABC", "ABC\u001E", "\u001E", "\u001FABC", "ABC\u001F", "\u001F",
            "\tABC\u001D \r\n", "\r\n \u001DABC\t"})
    void createPatchAndLookupRejectInternalWhitespaceAndNonScannerControlCharacters(String raw) {
        Product product = product();
        when(productRepository.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));
        ProductPatchRequest patch = new ProductPatchRequest();
        patch.setBarcode(raw);

        assertInvalidBarcode(() -> service.create(token(), "7", request(null, raw, false, null)));
        assertInvalidBarcode(() -> service.patch(token(), "7", "3", patch));
        assertInvalidBarcode(() -> service.lookup(token(), "7", raw));
        assertThat(product.getBarcode()).isEqualTo("123456");
        verify(productRepository, never()).save(any());
        verify(productRepository, never()).findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(any(), any(), any());
        verify(productRepository, never()).findFirstByShopIdAndBarcodeAndStatusAndIdNotOrderByIdDesc(any(), any(), any(), any());
        verifyNoInteractions(auditLogService);
    }

    @ParameterizedTest
    @ValueSource(ints = {0x41, 0x1F600, 0x20000})
    void barcodeLengthIsValidatedAfterTrimOnEveryOperation(int codePoint) {
        String character = new String(Character.toChars(codePoint));
        String valid = character.repeat(100);
        String invalid = character.repeat(101);
        when(productRepository.save(any(Product.class))).thenAnswer(invocation -> invocation.getArgument(0));
        assertThat(service.create(token(), "7", request(null, "  " + valid + "\n", false, null)).barcode())
                .isEqualTo(valid);
        assertInvalidBarcode(() -> service.create(token(), "7", request(null, invalid, false, null)));

        when(productRepository.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product()));
        ProductPatchRequest patch = new ProductPatchRequest();
        patch.setBarcode(" " + valid + " ");
        assertThat(service.patch(token(), "7", "3", patch).barcode()).isEqualTo(valid);
        patch.setBarcode(invalid);
        assertInvalidBarcode(() -> service.patch(token(), "7", "3", patch));
        assertInvalidBarcode(() -> service.lookup(token(), "7", invalid));
    }

    @Test
    void patchCanKeepItsOwnBarcodeAndUsesTheNormalizedValueForConflictChecks() {
        when(productRepository.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product()));
        ProductPatchRequest patch = new ProductPatchRequest();
        patch.setBarcode(" 123456\n");

        assertThat(service.patch(token(), "7", "3", patch).barcode()).isEqualTo("123456");
        verify(productRepository).findFirstByShopIdAndBarcodeAndStatusAndIdNotOrderByIdDesc(7L, "123456", CatalogStatus.ACTIVE, 3L);
    }

    @Test
    void omittedBarcodeOnPatchPreservesEvenLegacyValuesWithoutRevalidation() {
        Product product = product();
        ReflectionTestUtils.setField(product, "barcode", "legacy barcode");
        when(productRepository.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));
        ProductPatchRequest patch = new ProductPatchRequest();
        patch.setName("Coffee");

        assertThat(service.patch(token(), "7", "3", patch).barcode()).isEqualTo("legacy barcode");
        verify(productRepository, never()).findFirstByShopIdAndBarcodeAndStatusAndIdNotOrderByIdDesc(any(), any(), any(), any());
    }

    @Test
    void lookupUsesOneExactShopScopedActiveProductRead() {
        Product product = product();
        ReflectionTestUtils.setField(product, "barcode", "ABC-123");
        when(productRepository.findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(7L, "ABC-123", CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));

        ProductResponse response = service.lookup(token(), "7", "\u2003\u00a0 ABC-123\n");

        assertThat(response.id()).isEqualTo(3L);
        assertThat(response.barcode()).isEqualTo("ABC-123");
        assertThat(response.status()).isEqualTo(CatalogStatus.ACTIVE);
        verify(productRepository).findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(7L, "ABC-123", CatalogStatus.ACTIVE);
        org.mockito.Mockito.verifyNoMoreInteractions(productRepository);
        verifyNoInteractions(auditLogService);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", " \t\r\n ", "\u2003\u00a0"})
    void lookupRequiresANonblankBarcode(String raw) {
        assertInvalidBarcode(() -> service.lookup(token(), "7", raw));
        verifyNoInteractions(productRepository);
    }

    @Test
    void lookupReturnsNotFoundForMissingArchivedOrForeignShopProduct() {
        assertThatThrownBy(() -> service.lookup(token(), "7", "foreign-or-archived"))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_NOT_FOUND));
        verify(productRepository).findFirstByShopIdAndBarcodeAndStatusOrderByIdDesc(
                7L, "foreign-or-archived", CatalogStatus.ACTIVE);
    }

    @ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(value = ErrorCode.class, names = {
            "SHOP_ACCESS_DENIED", "SHOP_INACTIVE", "SHOP_NOT_FOUND", "ACCOUNT_DISABLED", "AUTH_PROFILE_NOT_FOUND"})
    void lookupChecksShopAccessBeforeBarcodeValidationOrProductReads(ErrorCode error) {
        when(shopService.requireOwnedActiveShop(any(), eq("7"))).thenThrow(new BusinessException(error));

        assertThatThrownBy(() -> service.lookup(token(), "7", null))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(error));
        verifyNoInteractions(productRepository);
    }

    private void assertInvalidBarcode(org.assertj.core.api.ThrowableAssert.ThrowingCallable operation) {
        assertThatThrownBy(operation).isInstanceOfSatisfying(BusinessException.class, exception -> {
            assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.INVALID_PRODUCT_BARCODE);
            assertThat(exception.getDetails()).extracting(ApiErrorDetail::field).containsExactly("barcode");
        });
    }

    @Test
    void patchKeepsFieldsThatWereNotSent() {
        Product product = product();
        when(productRepository.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));
        ProductPatchRequest request = new ProductPatchRequest();
        request.setSellingPriceVnd(30000L);

        ProductResponse response = service.patch(token(), "7", "3", request);

        assertThat(response.sellingPriceVnd()).isEqualTo(30000L);
        assertThat(response.name()).isEqualTo("Cà phê");
        assertThat(response.categoryId()).isEqualTo(10L);
        assertThat(response.barcode()).isEqualTo("123456");
        assertThat(response.stockQuantity()).isEqualByComparingTo("10.000");
        verify(productRepository).findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE);
    }

    @Test
    void patchMergesAgainstTheStockReadUnderTheCheckoutLock() {
        Product product = product();
        product.deductStock(new BigDecimal("3.000"));
        when(productRepository.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));
        ProductPatchRequest request = new ProductPatchRequest();
        request.setName("Cà phê mới");

        ProductResponse response = service.patch(token(), "7", "3", request);

        assertThat(response.stockQuantity()).isEqualByComparingTo("7.000");
        verify(productRepository, never()).findByIdAndShopIdAndStatus(any(), any(), any());
    }

    @Test
    void patchCanClearOptionalFieldsWithExplicitNull() {
        Product product = product();
        when(productRepository.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));
        ProductPatchRequest request = new ProductPatchRequest();
        request.setCategoryId(null);
        request.setBarcode(null);
        request.setCostPriceVnd(null);

        ProductResponse response = service.patch(token(), "7", "3", request);

        assertThat(response.categoryId()).isNull();
        assertThat(response.barcode()).isNull();
        assertThat(response.costPriceVnd()).isNull();
        assertThat(response.stockQuantity()).isEqualByComparingTo("10.000");
    }

    @Test
    void disablingStockTrackingClearsExistingStock() {
        Product product = product();
        when(productRepository.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));
        ProductPatchRequest request = new ProductPatchRequest();
        request.setTracked(false);

        ProductResponse response = service.patch(token(), "7", "3", request);

        assertThat(response.tracked()).isFalse();
        assertThat(response.stockQuantity()).isNull();
    }

    @Test
    void enablingStockTrackingStartsAtZeroWithoutAnAbsoluteStockUpdate() {
        Product product = product();
        product.replace(null, "Tea", null, null, "cup", 25000L, null, false, null);
        when(productRepository.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));
        ProductPatchRequest request = new ProductPatchRequest();
        request.setTracked(true);

        ProductResponse response = service.patch(token(), "7", "3", request);

        assertThat(response.tracked()).isTrue();
        assertThat(response.stockQuantity()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void keepingStockTrackingEnabledDoesNotResetStock() {
        Product product = product();
        when(productRepository.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));
        ProductPatchRequest request = new ProductPatchRequest();
        request.setTracked(true);
        assertThat(service.patch(token(), "7", "3", request).stockQuantity()).isEqualByComparingTo("10.000");
    }

    @Test
    void rejectsDuplicateBarcodeOnPatch() {
        Product product = product();
        when(productRepository.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));
        Product conflict = product();
        ReflectionTestUtils.setField(conflict, "id", 4L);
        when(productRepository.findFirstByShopIdAndBarcodeAndStatusAndIdNotOrderByIdDesc(
                7L, "654321", CatalogStatus.ACTIVE, 3L)).thenReturn(Optional.of(conflict));

        ProductPatchRequest request = new ProductPatchRequest();
        request.setBarcode(" 654321\n");
        request.setName("Must not be saved");
        assertThatThrownBy(() -> service.patch(token(), "7", "3", request))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_BARCODE_CONFLICT);
                    assertThat(exception.getDetails()).containsExactly(
                            new ApiErrorDetail("barcode", "already_in_use", 4L, CatalogStatus.ACTIVE));
                });
        assertThat(product.getBarcode()).isEqualTo("123456");
        assertThat(product.getName()).isEqualTo("Cà phê");
        verifyNoInteractions(auditLogService);
    }

    @Test
    void rejectsArchivedOrMissingProductForUpdateAndArchive() {
        assertThatThrownBy(() -> service.patch(token(), "7", "3", new ProductPatchRequest()))
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

        assertThatThrownBy(() -> service.list(token(), "8", Products.defaults()).items())
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.SHOP_INACTIVE));
        verify(productRepository, never()).findAllByShopIdAndStatusOrderByIdAsc(any(), any());
    }

    @Test
    void archivesWithoutDeletingAndRecordsTheOwner() {
        Product product = product();
        when(productRepository.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));

        service.archive(token(), "7", "3");

        assertThat(product.getStatus()).isEqualTo(CatalogStatus.ARCHIVED);
        assertThat(product.getArchivedAt()).isNotNull();
        assertThat(product.getArchivedByUserId()).isEqualTo(42L);
        verify(productRepository).findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE);
        verify(productRepository, never()).delete(any(Product.class));
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
