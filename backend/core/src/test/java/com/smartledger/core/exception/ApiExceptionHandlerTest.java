package com.smartledger.core.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLException;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

class ApiExceptionHandlerTest {
    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void mapsAConcurrentBarcodeUniqueViolationToTheCatalogError() {
        SQLException sqlCause = new SQLException(
                "duplicate key value violates unique constraint \"uq_products_shop_barcode\"", "23505");
        var response = handler.handleDataIntegrity(new DataIntegrityViolationException("write failed", sqlCause),
                new MockHttpServletRequest());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().code()).isEqualTo("product_barcode_conflict");
    }

    @Test
    void doesNotMislabelAnUnrelatedDatabaseFailureAsABarcodeConflict() {
        var response = handler.handleDataIntegrity(new DataIntegrityViolationException("other failure"),
                new MockHttpServletRequest());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().code()).isEqualTo("internal_error");
    }

    @Test
    void mapsAConcurrentFirstSessionToARetryableAuthConflict() {
        SQLException sqlCause = new SQLException(
                "duplicate key value violates unique constraint \"uq_auth_identities_provider_subject\"", "23505");
        var response = handler.handleDataIntegrity(new DataIntegrityViolationException("write failed", sqlCause),
                new MockHttpServletRequest());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().code()).isEqualTo("auth_session_conflict");
    }

    @Test
    void mapsAHibernateConstraintNameWithoutRelyingOnTheMessage() {
        var violation = new org.hibernate.exception.ConstraintViolationException(
                "insert failed", new SQLException("duplicate", "23505"), "UQ_PRODUCTS_SHOP_BARCODE");
        var response = handler.handleDataIntegrity(new DataIntegrityViolationException("write failed", violation),
                new MockHttpServletRequest());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().code()).isEqualTo("product_barcode_conflict");
    }

    @Test
    void doesNotTreatAnotherUniqueConstraintAsABusinessConflict() {
        SQLException sqlCause = new SQLException(
                "duplicate key value violates unique constraint \"uq_sale_refunds_sale_id\"", "23505");
        var response = handler.handleDataIntegrity(new DataIntegrityViolationException("write failed", sqlCause),
                new MockHttpServletRequest());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
