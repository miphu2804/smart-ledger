package com.smartledger.core.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.smartledger.core.enums.CatalogStatus;
import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class ProductStockRestorationTest {
    @Test
    void restoresExactlyTheMaximumWithoutRoundingOrClamping() {
        Product product = tracked("999999999999.998");
        product.restoreStock(new BigDecimal("0.001"));
        assertThat(product.getStockQuantity()).isEqualByComparingTo("999999999999.999");
    }

    @Test
    void overflowLeavesThePreviousQuantityUnchanged() {
        Product product = tracked("999999999999.999");
        expectError(product, new BigDecimal("0.001"), ErrorCode.PRODUCT_STOCK_OVERFLOW);
        assertThat(product.getStockQuantity()).isEqualByComparingTo("999999999999.999");
    }

    @Test
    void archivedProductsStillAllowRestoration() {
        Product product = tracked("2");
        product.archive(42L);
        product.restoreStock(BigDecimal.ONE);
        assertThat(product.getStatus()).isEqualTo(CatalogStatus.ARCHIVED);
        assertThat(product.getStockQuantity()).isEqualByComparingTo("3");
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"0", "-0.001"})
    void invalidQuantityRetainsTheRestockUnavailableError(String quantity) {
        Product product = tracked("2");
        expectError(product, quantity == null ? null : new BigDecimal(quantity), ErrorCode.SALE_RESTOCK_UNAVAILABLE);
        assertThat(product.getStockQuantity()).isEqualByComparingTo("2");
    }

    @Test
    void untrackedOrMissingStockRetainsTheRestockUnavailableError() {
        Product product = Product.create(7L);
        expectError(product, BigDecimal.ONE, ErrorCode.SALE_RESTOCK_UNAVAILABLE);
        product.replace(null, "Item", null, null, "piece", 1000L, null, true, null);
        expectError(product, BigDecimal.ONE, ErrorCode.SALE_RESTOCK_UNAVAILABLE);
        assertThat(product.getStockQuantity()).isNull();
    }

    private Product tracked(String stock) {
        Product product = Product.create(7L);
        product.replace(null, "Item", null, null, "piece", 1000L, null, true, new BigDecimal(stock));
        return product;
    }

    private void expectError(Product product, BigDecimal quantity, ErrorCode code) {
        assertThatThrownBy(() -> product.restoreStock(quantity)).isInstanceOfSatisfying(BusinessException.class,
                error -> assertThat(error.getErrorCode()).isEqualTo(code));
    }
}
