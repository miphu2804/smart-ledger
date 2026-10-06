package com.smartledger.core.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartledger.core.dto.request.ProductStockInRequest;
import com.smartledger.core.dto.response.ProductResponse;
import com.smartledger.core.entity.Product;
import com.smartledger.core.entity.Shop;
import com.smartledger.core.enums.AuditAction;
import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import com.smartledger.core.repository.CategoryRepository;
import com.smartledger.core.repository.IdempotencyKeyRepository;
import com.smartledger.core.repository.ProductRepository;
import com.smartledger.core.security.VerifiedFirebaseToken;
import com.smartledger.core.service.impl.IdempotencyServiceImpl;
import com.smartledger.core.service.impl.ProductServiceImpl;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

class ProductStockInServiceTest {
    private final ShopService shops = mock(ShopService.class);
    private final ProductRepository products = mock(ProductRepository.class);
    private final CategoryRepository categories = mock(CategoryRepository.class);
    private final AuditLogService audit = mock(AuditLogService.class);
    private final IdempotencyKeyRepository keys = mock(IdempotencyKeyRepository.class);
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final ProductService service = new ProductServiceImpl(shops, products, categories, audit,
            new IdempotencyServiceImpl(keys, mapper, 30));
    private final VerifiedFirebaseToken token = new VerifiedFirebaseToken("owner", null, false, null, null, null);
    private Product product;

    @BeforeEach
    void fixture() {
        Shop shop = Shop.create(42L, "Shop", "Retail", null, null);
        ReflectionTestUtils.setField(shop, "id", 7L);
        when(shops.requireOwnedActiveShop(token, "7")).thenReturn(shop);
        product = Product.create(7L);
        ReflectionTestUtils.setField(product, "id", 3L);
        product.replace(null, "Tea", null, null, "cup", 50_000L, 20_000L, true, BigDecimal.TEN);
        when(products.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE))
                .thenReturn(Optional.of(product));
        when(keys.reserve(eq(7L), eq(42L), eq("PRODUCT_STOCK_IN"), any(), any(), any())).thenReturn(true);
    }

    @Test
    void addsFractionalStockAndAuditsNormalizedReasonAndDelta() {
        ProductResponse result = add(" key ", "2.125", "  Delivery  ");
        assertThat(result.stockQuantity()).isEqualByComparingTo("12.125");
        assertThat(result.sellingPriceVnd()).isEqualTo(50_000L);
        assertThat(result.costPriceVnd()).isEqualTo(20_000L);
        verify(audit).recordOwner(any(), eq(AuditAction.STOCK_ADJUSTED), eq(3L), eq("Delivery"), eq("key"),
                eq(AuditLogService.metadata("source", "STOCK_IN", "quantity", new BigDecimal("2.125"),
                        "beforeStock", BigDecimal.TEN, "afterStock", new BigDecimal("12.125"))));
        var order = inOrder(keys, products, audit);
        order.verify(keys).reserve(eq(7L), eq(42L), eq("PRODUCT_STOCK_IN"), eq("key"), any(), any());
        order.verify(products).findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE);
        order.verify(audit).recordOwner(any(), any(), any(), any(), any(), any());
        order.verify(products).flush();
        order.verify(keys).complete(eq(7L), eq("PRODUCT_STOCK_IN"), eq("key"), eq("PRODUCT"), eq(3L), eq(200), any());
    }

    @Test
    void retryCanonicalizesDecimalAndBlankReasonAndReplaysOriginalSnapshot() throws Exception {
        when(keys.reserve(eq(7L), eq(42L), eq("PRODUCT_STOCK_IN"), eq("key"), any(), any()))
                .thenReturn(true, false);
        ProductResponse first = add("key", "5", null);
        var hash = ArgumentCaptor.forClass(String.class);
        verify(keys).reserve(eq(7L), eq(42L), eq("PRODUCT_STOCK_IN"), eq("key"), hash.capture(), any());
        when(keys.find(7L, "PRODUCT_STOCK_IN", "key")).thenReturn(new IdempotencyKeyRepository.StoredResult(
                42L, hash.getValue(), mapper.writeValueAsString(first), OffsetDateTime.now().plusDays(1)));
        product.deductStock(BigDecimal.ONE);
        ProductResponse replay = add("key", "5.000", "  ");
        assertThat(replay).isEqualTo(first);
        assertThat(product.getStockQuantity()).isEqualByComparingTo("14");
        verify(products, times(1)).findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE);
        verify(audit, times(1)).recordOwner(any(), any(), any(), any(), any(), any());
    }

    @Test
    void rejectsOverflowWithoutMutatingProductOrWritingAudit() {
        product.replace(null, "Tea", null, null, "cup", 50_000L, null, true,
                new BigDecimal("999999999999.999"));
        assertThatThrownBy(() -> add("key", "0.001", null))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_STOCK_OVERFLOW));
        assertThat(product.getStockQuantity()).isEqualByComparingTo("999999999999.999");
        verifyNoInteractions(audit);
    }

    @Test
    void permitsTheExactNumericBoundary() {
        product.replace(null, "Tea", null, null, "cup", 50_000L, null, true,
                new BigDecimal("999999999999.998"));
        assertThat(add("key", "0.001", null).stockQuantity()).isEqualByComparingTo("999999999999.999");
    }

    @Test
    void domainGuardRejectsMissingZeroAndNegativeQuantityWithoutChangingStock() {
        for (BigDecimal quantity : java.util.Arrays.asList(null, BigDecimal.ZERO, BigDecimal.ONE.negate())) {
            assertThatThrownBy(() -> product.addStock(quantity)).isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(product.getStockQuantity()).isEqualByComparingTo("10");
    }

    @Test
    void rejectsUntrackedOrInconsistentStockWithoutAudit() {
        for (boolean tracked : new boolean[] {false, true}) {
            product.replace(null, "Tea", null, null, "cup", 50_000L, null, tracked, null);
            assertThatThrownBy(() -> add("key", "1", null))
                    .isInstanceOfSatisfying(BusinessException.class,
                            e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_STOCK_IN_UNAVAILABLE));
        }
        verifyNoInteractions(audit);
    }

    @Test
    void rejectsInvalidIdBeforeReservingKey() {
        assertThatThrownBy(() -> service.stockIn(token, "7", "bad", "key",
                new ProductStockInRequest(BigDecimal.ONE, null)))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_PRODUCT_ID));
        verifyNoInteractions(keys);
    }

    @Test
    void rejectsUnavailableProductAndNeverReadsWithoutLock() {
        when(products.findLockedByIdAndShopIdAndStatus(3L, 7L, CatalogStatus.ACTIVE)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> add("key", "1", null))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_NOT_FOUND));
        verify(products, never()).findByIdAndShopIdAndStatus(any(), any(), any());
        verifyNoInteractions(audit);
    }

    @Test
    void rejectsDeniedShopBeforeAnyReservationOrStockQuery() {
        when(shops.requireOwnedActiveShop(token, "7")).thenThrow(new BusinessException(ErrorCode.SHOP_ACCESS_DENIED));
        assertThatThrownBy(() -> add("key", "1", null)).isInstanceOf(BusinessException.class);
        verifyNoInteractions(keys, products, audit);
    }

    private ProductResponse add(String key, String quantity, String reason) {
        return service.stockIn(token, "7", "3", key, new ProductStockInRequest(new BigDecimal(quantity), reason));
    }
}
