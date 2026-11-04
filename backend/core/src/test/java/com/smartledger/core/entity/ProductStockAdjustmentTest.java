package com.smartledger.core.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.smartledger.core.enums.ErrorCode;
import com.smartledger.core.exception.BusinessException;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class ProductStockAdjustmentTest {
    @Test
    void removesFractionalStockAndAllowsExactlyZeroWithoutChangingPrices() {
        Product product = product(true, BigDecimal.TEN);
        product.adjustStockDown(new BigDecimal("2.125"));
        assertThat(product.getStockQuantity()).isEqualByComparingTo("7.875");
        product.adjustStockDown(new BigDecimal("7.875"));
        assertThat(product.getStockQuantity()).isEqualByComparingTo("0");
        assertThat(product.getSellingPriceVnd()).isEqualTo(50_000L);
        assertThat(product.getCostPriceVnd()).isEqualTo(20_000L);
    }

    @Test
    void cannotRemoveMoreThanAvailableOrAdjustAnUntrackedProduct() {
        Product product = product(true, BigDecimal.ONE);
        assertThatThrownBy(() -> product.adjustStockDown(new BigDecimal("1.001")))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_STOCK_INSUFFICIENT));
        assertThat(product.getStockQuantity()).isEqualByComparingTo("1");
        for (boolean tracked : new boolean[] {false, true}) {
            Product invalid = product(tracked, null);
            assertThatThrownBy(() -> invalid.adjustStockDown(BigDecimal.ONE))
                    .isInstanceOfSatisfying(BusinessException.class,
                            e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.PRODUCT_STOCK_ADJUSTMENT_UNAVAILABLE));
            assertThat(invalid.getStockQuantity()).isNull();
        }
    }

    @Test
    void rejectsMissingZeroAndNegativeQuantityBeforeMutation() {
        Product product = product(true, BigDecimal.TEN);
        for (BigDecimal amount : java.util.Arrays.asList(null, BigDecimal.ZERO, BigDecimal.ONE.negate())) {
            assertThatThrownBy(() -> product.adjustStockDown(amount)).isInstanceOf(IllegalArgumentException.class);
        }
        assertThat(product.getStockQuantity()).isEqualByComparingTo("10");
    }

    private Product product(boolean tracked, BigDecimal stock) {
        Product product = Product.create(7L);
        product.replace(null, "Tea", null, null, "cup", 50_000L, 20_000L, tracked, stock);
        return product;
    }
}
