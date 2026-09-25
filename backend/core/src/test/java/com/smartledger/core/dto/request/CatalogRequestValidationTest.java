package com.smartledger.core.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.math.BigDecimal;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;

class CatalogRequestValidationTest {
    private static final ValidatorFactory VALIDATOR_FACTORY = Validation.buildDefaultValidatorFactory();
    private static final Validator VALIDATOR = VALIDATOR_FACTORY.getValidator();

    @AfterAll
    static void closeValidatorFactory() {
        VALIDATOR_FACTORY.close();
    }

    @Test
    void categoryRequiresNonblankNameWithinSchemaLimit() {
        assertThat(VALIDATOR.validate(new CategoryWriteRequest(" ")))
                .extracting(violation -> violation.getPropertyPath().toString())
                .contains("name");
        assertThat(VALIDATOR.validate(new CategoryWriteRequest("x".repeat(151))))
                .extracting(violation -> violation.getPropertyPath().toString())
                .contains("name");
        assertThat(VALIDATOR.validate(new CategoryWriteRequest("Đồ uống"))).isEmpty();
    }

    @Test
    void productRequiresNameUnitPriceAndTrackedFlag() {
        ProductWriteRequest request = new ProductWriteRequest(null, " ", null, null, " ",
                null, null, null, null);

        assertThat(VALIDATOR.validate(request))
                .extracting(violation -> violation.getPropertyPath().toString())
                .contains("name", "unit", "sellingPriceVnd", "tracked");
    }

    @Test
    void productRejectsNegativeMoneyAndStockAndInvalidCategoryId() {
        ProductWriteRequest request = new ProductWriteRequest(0L, "Cà phê", null, null, "ly",
                -1L, -1L, true, new BigDecimal("-0.001"));

        assertThat(VALIDATOR.validate(request))
                .extracting(violation -> violation.getPropertyPath().toString())
                .contains("categoryId", "sellingPriceVnd", "costPriceVnd", "stockQuantity");
    }

    @Test
    void productRejectsStockScaleExceedingNumeric15By3() {
        ProductWriteRequest request = new ProductWriteRequest(null, "Cà phê", null, null, "ly",
                25000L, null, true, new BigDecimal("1.1234"));

        assertThat(VALIDATOR.validate(request))
                .extracting(violation -> violation.getPropertyPath().toString())
                .contains("stockQuantity");
    }

}
